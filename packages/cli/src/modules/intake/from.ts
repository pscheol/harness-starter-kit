/**
 * `knots-sync intake --from jira:<키> | notion:<페이지>`(설계 10 §3.6, 08 §3.11). 외부 출처 → intake.py 한 곳으로 저장한다.
 * 가져온 글 · 첨부는 신뢰하지 않는 입력이다: 형식 · 제한 · 비밀값 검사 · 제어 문자 제거 · `trust: untrusted` 는 intake.py 가 한다.
 * 같은 출처를 다시 가져오면 바뀐 부분을 diff 로 보이고, 사람이 `--yes` 로 고르기 전에는 덮어쓰지 않는다(exit 4).
 * 토큰은 환경 변수에서만 읽고 임시 폴더 · 리포 · 자식 프로세스 환경에 넣지 않는다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { python } from "../../../../dashboard/src/util";
import { adfToMarkdown } from "./adf";
import { bool, str } from "../../cli/args";
import type { CommandResult, Ctx } from "../../cli/context";
import { targetOf } from "../../cli/context";
import { CliError, EXIT, usageError } from "../../core/errors";
import { moduleEnabled, readTracker } from "../jira/config";
import { jiraCredentials, makeJiraClient, type JiraClient, type JiraIssue } from "../jira/rest";
import { fetchNotion, makeNotionApi, notionConfigOf, notionToken, writeBackNotion } from "./notion";
import type { Imported } from "./types";

const SECRET_ENV = ["NOTION_TOKEN", "JIRA_API_TOKEN", "JIRA_USER_EMAIL"];
const MB = 1024 * 1024;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseFrom(raw: string): { type: "jira" | "notion"; ref: string } {
  const i = raw.indexOf(":");
  const type = raw.slice(0, i);
  const ref = raw.slice(i + 1).trim();
  if ((type !== "jira" && type !== "notion") || !ref) throw usageError(`--from 형식이 틀리다: ${raw}`, "--from jira:<이슈 키> 또는 --from notion:<페이지 URL|id>");
  return { type, ref };
}

function metaOf(root: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ".agents/knots-sync.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function maxBytesOf(meta: Record<string, unknown>): number {
  const conf = meta.intake && typeof meta.intake === "object" ? (meta.intake as Record<string, unknown>) : {};
  return Number(conf.maxFileMB ?? 20) * MB;
}

async function fromJira(ctx: Ctx, root: string, key: string, maxBytes: number, kind: string | undefined): Promise<Imported> {
  if (!moduleEnabled(root, "jira-workflow")) throw new CliError(EXIT.STATE, "jira-workflow 모듈이 꺼져 있다 — Jira 에서 가져오려면 켠다", "knots-sync add jira-workflow");
  const cfg = readTracker(root);
  if (!cfg?.baseUrl) throw new CliError(EXIT.STATE, "연결 설정이 비었다: .agents/issue-tracker.yml 의 baseUrl 이 TBD 다", "kns:jira-setup 스킬로 채운다");
  const client: JiraClient = makeJiraClient(cfg.baseUrl, jiraCredentials(cfg, ctx.io.env));
  const epic = await client.issue(key);
  const children = await client.children(key);
  const warnings: string[] = [];
  const attachments: Imported["attachments"] = [];
  const links: string[] = [];
  const takeAttachments = async (issue: JiraIssue): Promise<void> => {
    for (const att of issue.attachments) {
      if (att.size > maxBytes) {
        links.push(att.url);
        warnings.push(`${issue.key} ${att.filename}: ${Math.ceil(att.size / MB)}MB 라 내려받지 않고 링크로 둔다`);
        continue;
      }
      try {
        attachments.push({ name: `${issue.key}-${att.filename}`, data: await client.download(att.url, maxBytes) });
      } catch (err) {
        warnings.push(`${issue.key} ${att.filename}: 내려받지 못했다(${err instanceof Error ? err.message : String(err)})`);
      }
    }
  };
  await takeAttachments(epic);
  const parts = [`## 출처\n\n- Jira ${epic.key} (${epic.type}, 상태 ${epic.statusName}): ${epic.webUrl}`, adfToMarkdown(epic.description)];
  if (children.length) {
    parts.push("## 하위 작업 항목");
    for (const c of children) {
      await takeAttachments(c);
      parts.push(`### ${c.key} ${c.summary}\n\n- 유형 ${c.type} · 상태 ${c.statusName}\n\n${adfToMarkdown(c.description)}`.trimEnd());
    }
  }
  links.push(epic.webUrl);
  const updated = [epic, ...children].map((i) => i.updated).sort().pop() ?? "";
  return { title: epic.summary, kind: kind ?? "feature", text: parts.filter(Boolean).join("\n\n"), attachments, links: [...new Set(links)], source: { type: "jira", ref: key, url: epic.webUrl, version: updated }, warnings, key };
}

export async function runIntakeFrom(ctx: Ctx, from: string): Promise<CommandResult> {
  const { type, ref } = parseFrom(from);
  const root = targetOf(ctx);
  const meta = metaOf(root);
  const name = str(ctx.values, "name");
  if (!name || !NAME.test(name)) throw usageError("--from 은 --name <영문-kebab> 이 필요하다(2~5단어)");
  const kindFlag = str(ctx.values, "kind");
  const depth = str(ctx.values, "depth") === undefined ? 1 : Number(str(ctx.values, "depth"));
  if (!Number.isInteger(depth) || depth < 0 || depth > 5) throw usageError("--depth 는 0~5 정수다(하위 페이지를 따라갈 단계, 기본 1)");
  const maxBytes = maxBytesOf(meta);

  let imported: Imported;
  let notion: { api: ReturnType<typeof makeNotionApi>; pageId: string } | null = null;
  const cfg = notionConfigOf(meta);
  if (type === "jira") {
    imported = await fromJira(ctx, root, ref, maxBytes, kindFlag);
  } else {
    if (!moduleEnabled(root, "notion")) throw new CliError(EXIT.STATE, "notion 모듈이 꺼져 있다 — Notion 에서 가져오려면 켠다", "knots-sync add notion");
    const api = makeNotionApi(notionToken(ctx.io.env), ctx.io.env);
    const got = await fetchNotion(api, ref, { config: cfg, depth, maxBytes, ...(kindFlag ? { kind: kindFlag } : {}) });
    imported = got;
    notion = { api, pageId: got.pageId };
  }
  const title = str(ctx.values, "title") ?? imported.title;
  const kind = kindFlag ?? imported.kind;
  const keyFlag = str(ctx.values, "key");
  const key = keyFlag ?? (moduleEnabled(root, "jira-workflow") ? imported.key : null);
  if (moduleEnabled(root, "jira-workflow") && !key && kind !== "bug") throw usageError("jira-workflow 모듈이 켜져 있다 — Intent 키는 Jira 에픽 키다. --key <에픽 키> 로 준다");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-from-"));
  try {
    fs.chmodSync(tmp, 0o700);
    const textFile = path.join(tmp, "text.md");
    fs.writeFileSync(textFile, imported.text, { mode: 0o600 });
    const sourceFile = path.join(tmp, "source.json");
    fs.writeFileSync(sourceFile, JSON.stringify(imported.source), { mode: 0o600 });
    const args = ["scripts/harness/intake.py", "new", "--json", "--title", title, "--kind", kind, "--name", name, "--text-file", textFile, "--source-json", sourceFile];
    const area = str(ctx.values, "area");
    if (area) args.push("--area", area);
    if (key) args.push("--key", key);
    if (bool(ctx.values, "yes")) args.push("--apply");
    imported.attachments.forEach((att, i) => {
      const dir = path.join(tmp, String(i));
      fs.mkdirSync(dir, { mode: 0o700 });
      const file = path.join(dir, path.basename(att.name));
      fs.writeFileSync(file, att.data, { mode: 0o600 });
      args.push("--attach", file);
    });
    for (const l of imported.links.filter((x) => /^https?:\/\/\S+$/.test(x))) args.push("--link", l);
    const childEnv = { ...ctx.io.env };
    for (const k of SECRET_ENV) delete childEnv[k];
    const r = await python(root, childEnv, args, 300_000);
    if (r.code !== 0 && r.code !== 4) {
      const message = (r.stderr || r.stdout).trim().split("\n").filter(Boolean).pop() ?? "가져오지 못했다";
      throw new CliError(EXIT.CHECK, message.slice(0, 500));
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(r.stdout) as Record<string, unknown>;
    } catch {
      throw new CliError(EXIT.CHECK, `intake.py 출력이 JSON 이 아니다: ${r.stdout.slice(0, 200)}`);
    }
    const warnings = [...imported.warnings, ...((data.warnings as string[]) ?? [])];
    const action = String(data.action);
    const lines: string[] = [];
    let wrote: string[] = [];
    if (action === "diff") {
      lines.push(`이미 가져온 출처다: ${String(data.folder)} — 바뀐 부분(원본은 리포다, 반영하려면 --yes 로 다시 실행한다)`, ...((data.diff as string[]) ?? []));
    } else if (action === "same") {
      lines.push(`변화 없음: ${String(data.folder)} — 이미 가져온 내용과 같다`);
    } else {
      lines.push(`✔ ${action === "updated" ? "다시 가져옴" : "접수"}: ${String(data.folder)}`);
    }
    if (notion && cfg.writeBack && (action === "created" || action === "updated")) {
      const folderName = String(data.folder).split("/").pop() ?? "";
      const intentKey = /^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-/.exec(folderName)?.[1] ?? "";
      wrote = await writeBackNotion(notion.api, notion.pageId, cfg, { status: "접수됨", key: intentKey });
      if (wrote.length) lines.push(`Notion 속성 갱신: ${wrote.join(", ")}`);
    }
    lines.push(...warnings.map((w) => `⚠ ${w}`));
    if (action === "created" || action === "updated") lines.push(`다음: ${String(data.next)} (세션 요청은 사람이 고를 때만)`);
    return { code: action === "diff" ? EXIT.HUMAN : EXIT.OK, data: { ...data, warnings, source: imported.source, writeBack: wrote }, lines };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
