/**
 * `pack new <이름> --dir <경로> [--from <파일>[#id]]… [--kit-range <범위>]`(설계 04 §3.9 · §3.11, HK-14 design §3.3).
 * 프로젝트 파일을 팩 구조로 옮긴 팩 골격을 만든다. 쓰는 곳은 사람이 준 --dir 하나다(리포 .agents/ 안은 거부).
 */
import fs from "node:fs";
import path from "node:path";
import { list, str } from "../cli/args";
import { targetOf, type CommandResult, type Ctx } from "../cli/context";
import { CliError, EXIT, usageError } from "../core/errors";
import { byteCompare, writeFileAtomic } from "../core/fsx";
import { loadInstalled, selectionFromMeta, tokensFromMeta } from "../core/installed";
import { loadLayout, type Layout } from "../core/layout";
import { PACK_NAME, PACK_SCHEMA } from "../core/packs";
import { locateTemplates } from "../core/templates";
import { wanted } from "../core/update-plan";
import { VERSION } from "../core/version";

type Provides = Record<"rules" | "skills" | "roles" | "guards" | "scripts" | "templates" | "hooks" | "verifyChecks", string[]>;

const TEST_PY = `"""팩 자체 검사(설계 04 §3.2 검증) — 이 폴더에서 python3 -m unittest tests.test_pack 으로 돈다. 팩과 함께 설치하지 않는다."""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PackTest(unittest.TestCase):
    def setUp(self):
        self.pack = json.loads((ROOT / "pack.json").read_text(encoding="utf-8"))

    def test_manifest(self):
        self.assertEqual("knots-sync.pack/v1", self.pack["schema"])
        self.assertRegex(self.pack["name"], r"^[a-z][a-z0-9-]{1,30}$")
        self.assertRegex(self.pack["version"], r"^\\d+\\.\\d+\\.\\d+")
        self.assertTrue(self.pack["requires"]["kit"])

    def test_fragment_ids_match_provides(self):
        name = self.pack["name"]
        hooks = json.loads((ROOT / "fragments/hooks.json").read_text(encoding="utf-8"))["hooks"]
        checks = json.loads((ROOT / "fragments/verify-checks.json").read_text(encoding="utf-8"))["checks"]
        self.assertEqual(sorted(h["id"] for h in hooks), sorted(self.pack["provides"].get("hooks", [])))
        self.assertEqual(sorted(c["id"] for c in checks), sorted(self.pack["provides"].get("verifyChecks", [])))
        for hook in hooks:
            self.assertTrue(hook["id"].startswith(f"harness-{name}-"), hook["id"])
        for check in checks:
            self.assertTrue(check["id"].startswith(f"{name}-"), check["id"])

    def test_no_links_and_shell_scripts_are_executable(self):
        for path in ROOT.rglob("*"):
            self.assertFalse(path.is_symlink(), path)
            if path.suffix == ".sh":
                self.assertTrue(path.stat().st_mode & 0o111, path)


if __name__ == "__main__":
    unittest.main()
`;

function defaultRange(): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(VERSION);
  return m ? `>=${m[1]}.${m[2]}.0 <${Number(m[1]) + 1}.0.0` : ">=2.0.0 <3.0.0";
}

/** 설치 경로 → 팩 안 `common/<세그먼트>/…`(layout 세그먼트를 거꾸로). 하네스 · root 세그먼트는 null. */
function reverseMap(layout: Layout, dest: string): string | null {
  const segs = layout.segments.filter((s) => s.harness === null && s.from !== "" && s.from !== "root/" && s.from.endsWith("/"));
  const best = segs.filter((s) => dest.startsWith(s.to)).sort((a, b) => b.to.length - a.to.length)[0];
  return best ? `common/${best.from}${dest.slice(best.to.length)}` : null;
}

function classify(dest: string, provides: Provides, name: string): boolean {
  let m: RegExpExecArray | null;
  if ((m = /^\.agents\/rules\/([^/]+)\.md$/.exec(dest))) provides.rules.push(m[1] as string);
  else if ((m = /^\.agents\/skills\/([^/]+)\//.exec(dest))) {
    if (!provides.skills.includes(m[1] as string)) provides.skills.push(m[1] as string);
  } else if ((m = /^\.agents\/roles\/([^/]+)\.md$/.exec(dest))) provides.roles.push(m[1] as string);
  else if ((m = /^scripts\/guards\/([^/]+)\.sh$/.exec(dest))) provides.guards.push(m[1] as string);
  else if (dest.startsWith("scripts/")) provides.scripts.push(dest);
  else if (dest.startsWith(".agents/docs/_spec-templates/")) provides.templates.push(dest);
  else if (!dest.startsWith(`tools/${name}/`)) return false;
  return true;
}

function filesUnder(target: string, rel: string): string[] {
  const abs = path.join(target, ...rel.split("/"));
  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink()) throw usageError(`--from 은 링크를 받지 않는다: ${rel}`);
  if (st.isFile()) return [rel];
  return fs
    .readdirSync(abs)
    .sort(byteCompare)
    .flatMap((n) => filesUnder(target, `${rel}/${n}`));
}

function pickItem(target: string, rel: string, id: string, key: "hooks" | "checks"): Record<string, unknown> {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(fs.readFileSync(path.join(target, ...rel.split("/")), "utf8")) as Record<string, unknown>;
  } catch (err) {
    throw usageError(`--from ${rel}#${id}: 읽을 수 없다(${err instanceof Error ? err.message : String(err)})`);
  }
  const items = Array.isArray(doc[key]) ? (doc[key] as Record<string, unknown>[]) : [];
  const found = items.find((x) => x && x.id === id);
  if (!found) throw usageError(`--from ${rel}#${id}: 그 id 가 없다`);
  return found;
}

export function runPack(ctx: Ctx): CommandResult {
  const [sub, name, ...rest] = ctx.positionals;
  if (sub !== "new") throw usageError("pack 하위 명령은 new 하나다", "knots-sync pack new <이름> --dir <경로> [--from <파일>[#id]]…");
  if (rest.length) throw usageError(`pack new: 위치 인자가 많다: ${rest.join(" ")}`);
  if (!name || !PACK_NAME.test(name)) throw usageError(`팩 이름은 ^[a-z][a-z0-9-]{1,30}$: ${name ?? "(없음)"}`);
  const dirFlag = str(ctx.values, "dir");
  if (!dirFlag) throw usageError("pack new 는 --dir <경로> 가 필요하다(빈 폴더나 없는 경로)");
  const target = targetOf(ctx);
  const dir = path.resolve(ctx.io.cwd, dirFlag);
  const relToRepo = path.relative(path.join(target, ".agents"), dir);
  if (!relToRepo.startsWith("..") && !path.isAbsolute(relToRepo)) throw usageError(`--dir 은 리포 .agents/ 안일 수 없다: ${dir}`);
  if (fs.existsSync(dir) && (!fs.statSync(dir).isDirectory() || fs.readdirSync(dir).length)) throw usageError(`--dir 은 빈 폴더나 없는 경로다: ${dir}`);

  const inst = loadInstalled(target, "pack new");
  const loc = locateTemplates({ flag: str(ctx.values, "templates"), env: ctx.io.env, cliFile: ctx.io.cliFile, cwd: ctx.io.cwd, version: VERSION });
  const layout = loadLayout(loc.dir);
  const { selection } = selectionFromMeta(layout, loc.dir, inst.meta);
  const tokens = tokensFromMeta(layout, selection, inst.meta, ctx.io.env, target);
  const kitPaths = new Set(wanted({ layout, templatesDir: loc.dir, selection, tokens }).want.keys());

  const provides: Provides = { rules: [], skills: [], roles: [], guards: [], scripts: [], templates: [], hooks: [], verifyChecks: [] };
  const overrides: string[] = [];
  const warnings: string[] = [];
  const files = new Map<string, { data: Buffer; executable: boolean }>();
  const hooks: Record<string, unknown>[] = [];
  const checks: Record<string, unknown>[] = [];
  for (const raw of list(ctx.values, "from")) {
    const hash = raw.indexOf("#");
    const rel = (hash < 0 ? raw : raw.slice(0, hash)).replace(/\/+$/, "");
    if (!rel || rel.startsWith("/") || rel.split("/").includes("..")) throw usageError(`--from 은 리포 상대 경로다: ${raw}`);
    if (hash >= 0) {
      const id = raw.slice(hash + 1);
      if (/^\.agents\/hooks(\.json|\.d\/[^/]+\.json)$/.test(rel)) {
        const item = { ...pickItem(target, rel, id, "hooks") };
        const newId = id.startsWith(`harness-${name}-`) ? id : `harness-${name}-${id.replace(/^harness-/, "")}`;
        hooks.push({ ...item, id: newId, owner: `pack:${name}` });
        provides.hooks.push(newId);
        if (newId !== id) warnings.push(`훅 id ${id} → ${newId}`);
      } else if (/^\.agents\/verify-checks(\.json|\.d\/[^/]+\.json)$/.test(rel)) {
        const item = { ...pickItem(target, rel, id, "checks") };
        const newId = id.startsWith(`${name}-`) ? id : `${name}-${id}`;
        checks.push({ ...item, id: newId, owner: `pack:${name}` });
        provides.verifyChecks.push(newId);
        if (newId !== id) warnings.push(`검사 id ${id} → ${newId}`);
      } else throw usageError(`--from <파일>#<id> 는 .agents/hooks.json · hooks.d · verify-checks.json · verify-checks.d 에만 쓴다: ${raw}`);
      continue;
    }
    if (!fs.existsSync(path.join(target, ...rel.split("/")))) throw usageError(`--from 파일이 없다: ${rel}`);
    for (const f of filesUnder(target, rel)) {
      const packPath = reverseMap(layout, f);
      if (!packPath) throw usageError(`팩이 가질 수 없는 경로다(하네스 파일 · 루트 문서): ${f}`, "원본(.agents/ · scripts/)을 준다");
      if (kitPaths.has(f)) {
        overrides.push(f);
        warnings.push(`${f} 는 킷 경로다 — overrides 에 넣었다(킷 판을 덮는다)`);
      } else if (!classify(f, provides, name)) throw usageError(`provides 로 나눌 수 없는 경로다: ${f}`, "규칙 · 스킬 · 역할 · 가드 · scripts · _spec-templates · tools/<팩>/ 만 옮긴다");
      const abs = path.join(target, ...f.split("/"));
      files.set(packPath, { data: fs.readFileSync(abs), executable: (fs.statSync(abs).mode & 0o111) !== 0 });
    }
  }
  const range = str(ctx.values, "kit-range") ?? defaultRange();
  const prune = (p: Provides): Partial<Provides> => Object.fromEntries(Object.entries(p).filter(([, v]) => v.length)) as Partial<Provides>;
  const manifest = { schema: PACK_SCHEMA, name, version: "0.1.0", description: `${name} 팩`, requires: { kit: range }, provides: prune(provides), overrides, tokens: [] as string[] };
  const out = new Map<string, { data: Buffer; executable: boolean }>([
    ["pack.json", { data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), executable: false }],
    ["README.md", { data: Buffer.from(`# ${name} 하네스 팩\n\n프로젝트의 \`.agents/knots-sync.json\` \`packs\` 에 \`git:<host>/<path>#v0.1.0\` 을 더하고 \`knots-sync update --packs\` 로 깐다.\n`), executable: false }],
    ["fragments/hooks.json", { data: Buffer.from(`${JSON.stringify({ schema: "knots-sync.hooks/v1", hooks }, null, 2)}\n`), executable: false }],
    ["fragments/verify-checks.json", { data: Buffer.from(`${JSON.stringify({ checks }, null, 2)}\n`), executable: false }],
    ["tests/test_pack.py", { data: Buffer.from(TEST_PY), executable: false }],
    [".gitignore", { data: Buffer.from("__pycache__/\n"), executable: false }],
    ...files,
  ]);
  try {
    fs.mkdirSync(path.join(dir, "common"), { recursive: true });
    for (const [rel, f] of out) writeFileAtomic(path.join(dir, ...rel.split("/")), f.data, f.executable);
  } catch (err) {
    throw new CliError(EXIT.ENV, `팩 골격을 쓰지 못했다: ${err instanceof Error ? err.message : String(err)}`);
  }
  const lines = [
    `knots-sync pack new ${name} — ${dir}`,
    ...[...out.keys()].sort(byteCompare).map((p) => `  + ${p}`),
    ...warnings.map((w) => `  ⚠ ${w}`),
    "  다음:",
    `    cd ${dirFlag} && git init && git add -A && git commit -m "${name} 0.1.0" && git tag v0.1.0`,
    `    프로젝트 .agents/knots-sync.json packs 에 "git:<host>/<path>#v0.1.0" 을 더한다(MR)`,
    "    knots-sync update --packs",
  ];
  return { code: EXIT.OK, data: { command: "pack", sub: "new", name, dir, files: [...out.keys()].sort(byteCompare), manifest, warnings }, lines };
}
