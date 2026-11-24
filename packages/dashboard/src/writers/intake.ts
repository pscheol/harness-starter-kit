/**
 * 요구사항 접수 POST /intake(설계 08 §3.11, HK-19 design §4). 처리는 scripts/harness/intake.py 하나다(CLI · 화면 같은 결과).
 * 화면은 첨부를 base64 로 보낸다(서버 본문 상한 1MB 안). 터미널(CLI)은 로컬 경로를 넘긴다 — 브라우저 요청은 경로를 받지 않는다.
 * 세션에 아무것도 보내지 않는다(접수 뒤 세션 요청은 사람이 고를 때만, DB-R25).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApiError, bad, readOnly } from "../errors";
import type { Project } from "../project";
import { isObj, python } from "../util";
import type { Via } from "./approvals";

const KINDS = new Set(["product", "feature", "change", "refactor", "bug"]);
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE_NAME = /^[^/\\\0]{1,120}$/;
const MAX_FILES = 20;

interface Upload {
  name: string;
  data: Buffer;
}

export interface IntakeBody {
  title: string;
  kind: string;
  name: string;
  area: string | null;
  text: string;
  links: string[];
  files: Upload[];
  paths: string[];
}

function strings(v: unknown, field: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw bad(`${field} 는 문자열 목록이다`);
  return v as string[];
}

export function intakeBody(body: unknown, via: Via): IntakeBody {
  if (!isObj(body)) throw bad("본문은 JSON 객체다");
  const { title, kind, name, area, text } = body;
  if (typeof title !== "string" || !title.trim() || title.length > 200) throw bad("title 은 1~200자 문자열이다");
  if (typeof kind !== "string" || !KINDS.has(kind)) throw bad(`kind 는 ${[...KINDS].join(" · ")}`);
  if (typeof name !== "string" || !NAME.test(name) || name.length > 60) throw bad("name 은 영문 소문자 · 숫자 kebab-case(60자 이하)다");
  if (area !== undefined && area !== null && (typeof area !== "string" || !NAME.test(area))) throw bad("area 는 kebab-case 다");
  if (text !== undefined && typeof text !== "string") throw bad("text 는 문자열이다");
  const links = strings(body.links, "links");
  if (links.some((l) => !/^https?:\/\/\S+$/.test(l))) throw bad("링크는 http(s):// 로 시작한다");
  const paths = strings(body.paths, "paths");
  if (paths.length && via !== "terminal") throw bad("로컬 경로(paths)는 터미널(CLI)에서만 받는다 — 화면은 files(base64)로 보낸다");
  const raw = body.files === undefined ? [] : body.files;
  if (!Array.isArray(raw)) throw bad("files 는 [{name, base64}] 목록이다");
  if (raw.length + paths.length > MAX_FILES) throw bad(`첨부는 ${MAX_FILES}개까지다`);
  const files = raw.map((f, i) => {
    if (!isObj(f) || typeof f.name !== "string" || !FILE_NAME.test(f.name) || f.name === "." || f.name === ".." || typeof f.base64 !== "string") {
      throw bad(`files[${i}] 는 {name: 파일 이름, base64: 내용} 이다`);
    }
    return { name: f.name, data: Buffer.from(f.base64, "base64") };
  });
  return { title, kind, name, area: typeof area === "string" ? area : null, text: typeof text === "string" ? text : "", links, files, paths };
}

/** intake.py 의 SystemExit 문구 → 422. JSON 이 아니면 그대로 잘라 낸다. */
function rejected(out: string): ApiError {
  const message = out.trim().split("\n").filter(Boolean).pop() ?? "접수하지 못했다";
  return new ApiError(422, "intake_rejected", message.slice(0, 500));
}

const OPS_REF = /^ops:[^#\s]+#(?:INC|NX)-\d+$/;

/** 운영 기록의 장애(INC-n)나 다음 Intent 후보(NX-n)에서 접수한다(설계 14 §3.8 · §3.9). 처리는 intake.py ops 하나다. */
async function postIntakeFromOps(p: Project, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const ref = body.from;
  if (typeof ref !== "string" || !OPS_REF.test(ref)) throw bad("from 은 ops:<운영 기록>#INC-<n> 또는 ops:<운영 기록>#NX-<n> 이다");
  const args = ["scripts/harness/intake.py", "ops", ref, "--json"];
  if (body.kind !== undefined) {
    if (typeof body.kind !== "string" || !KINDS.has(body.kind)) throw bad(`kind 는 ${[...KINDS].join(" · ")}`);
    args.push("--kind", body.kind);
  }
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !NAME.test(body.name) || body.name.length > 60) throw bad("name 은 영문 소문자 · 숫자 kebab-case(60자 이하)다");
    args.push("--name", body.name);
  }
  const r = await python(p.root, p.env, args, 300_000);
  if (r.code !== 0) throw rejected(r.stderr || r.stdout);
  try {
    return JSON.parse(r.stdout) as Record<string, unknown>;
  } catch {
    throw new ApiError(500, "internal", `intake.py 출력이 JSON 이 아니다: ${r.stdout.slice(0, 200)}`);
  }
}

export async function postIntake(p: Project, body: unknown, via: Via): Promise<Record<string, unknown>> {
  if (p.readOnly) throw readOnly();
  if (isObj(body) && body.from !== undefined) return postIntakeFromOps(p, body);
  const b = intakeBody(body, via);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-intake-"));
  try {
    fs.chmodSync(tmp, 0o700);
    const textFile = path.join(tmp, "text.md");
    fs.writeFileSync(textFile, b.text, { mode: 0o600 });
    const attach = b.files.map((f, i) => {
      const dir = path.join(tmp, String(i));
      fs.mkdirSync(dir, { mode: 0o700 });
      const file = path.join(dir, path.basename(f.name));
      fs.writeFileSync(file, f.data, { mode: 0o600 });
      return file;
    });
    const files = [...b.paths.map((x) => path.resolve(p.root, x)), ...attach];
    const args = ["scripts/harness/intake.py", "new", "--json", "--title", b.title, "--kind", b.kind, "--name", b.name, "--text-file", textFile];
    if (b.area) args.push("--area", b.area);
    for (const f of files) args.push("--attach", f);
    for (const l of b.links) args.push("--link", l);
    const r = await python(p.root, p.env, args, 300_000);
    if (r.code !== 0) throw rejected(r.stderr || r.stdout);
    try {
      return JSON.parse(r.stdout) as Record<string, unknown>;
    } catch {
      throw new ApiError(500, "internal", `intake.py 출력이 JSON 이 아니다: ${r.stdout.slice(0, 200)}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
