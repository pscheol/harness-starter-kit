// 병합 규칙(HK-13 design §5, HK-24, 03 §3.5 · §5 #6): CLAUDE.md 블록 · settings.json · .codex/hooks.json · config.toml · .gitattributes.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kitScriptSuffixes, parseHooks, settingsHooks } from "../src/projection/hooks";
import {
  claudeMdWant,
  codexConfigWant,
  codexHooksWant,
  gitattributesWant,
  MERGERS,
  settingsWant,
} from "../src/projection/merge";
import { loadSpec } from "../src/projection/spec";
import { REAL_TEMPLATES } from "./helpers";

const spec = loadSpec(REAL_TEMPLATES);
const kitHooks = parseHooks(fs.readFileSync(path.join(REAL_TEMPLATES, "common/agents-root/hooks.json"), "utf8"), spec.hookMap) ?? [];
const suffixes = kitScriptSuffixes(kitHooks, spec.hookMap);
const dispatch = (id: string, script: string): string => `bash "$CLAUDE_PROJECT_DIR"/scripts/hooks/dispatch.sh ${id} scripts/hooks/${script}`;
const md = MERGERS["claude-md"];
const settings = MERGERS.settings;
const codex = MERGERS["codex-config"];
const attrs = MERGERS.gitattributes;
const block = `${spec.claudeBlock.join("\n")}\n`;

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`병합 실패: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

describe("CLAUDE.md 블록(§5.1, 03 §3.8)", () => {
  const want = claudeMdWant(spec);
  it("새 파일 = @AGENTS.md + 블록", () => {
    expect(ok(md.merge(null, want))).toEqual({ ok: true, text: `@AGENTS.md\n\n${block}`, keys: ["line:@AGENTS.md", "block:claude"], created: true });
  });

  it("사람 파일: 끝에 줄 + 블록, 블록 밖은 그대로 · 다시 병합해도 같다 · 빼면 원래대로", () => {
    const mine = "# 내 메모\n\n- 손으로 쓴 줄\n";
    const once = ok(md.merge(mine, want));
    expect(once.text).toBe(`${mine}\n@AGENTS.md\n\n${block}`);
    expect(once.keys).toEqual(["line:@AGENTS.md", "block:claude"]);
    expect(ok(md.merge(once.text, want, once.keys)).text).toBe(once.text);
    expect(md.unmerge(once.text, once.keys, want)).toEqual({ ok: true, text: mine, empty: false });
    expect(md.missing(once.text, once.keys, want)).toEqual([]);
    expect(md.missing(mine, once.keys, want)).toEqual(["line:@AGENTS.md", "block:claude"]);
  });

  it("@AGENTS.md 가 이미 있으면 그 줄은 사람 몫 · 블록만 바꾼다", () => {
    const old = `@AGENTS.md\n# 위\n\n<!-- knots-sync:begin claude — 옛 블록 -->\n옛 줄\n<!-- knots-sync:end claude -->\n# 아래\n`;
    const r = ok(md.merge(old, want));
    expect(r.keys).toEqual(["block:claude"]);
    expect(r.text).toBe(`@AGENTS.md\n# 위\n\n${block}# 아래\n`);
  });

  it("끝 표지가 없으면 conflict", () => {
    expect(md.merge("<!-- knots-sync:begin claude -->\n끝 없음\n", want).ok).toBe(false);
  });

  it("킷이 만든 파일을 빼면 빈 것", () => {
    const fresh = ok(md.merge(null, want));
    expect(md.unmerge(fresh.text, fresh.keys, want)).toEqual({ ok: true, text: "", empty: true });
  });
});

describe("settings.json(§5.2, 03 §3.5 · §5 #6)", () => {
  const want = settingsWant(spec, { PROTECTED_PATH: "docs/references" }, settingsHooks(kitHooks, "claude", spec.hookMap, []), suffixes);
  // HK-23(VQ-R12): 승인 기록 · 기준선 · 관리 페이지 토큰 · 승인 로그
  const approvalDeny = ["Edit(//**/approvals.md)", "Edit(//**/.agents/quality-baseline.json)", "Edit(//**/.agents/state/dashboard.token)", "Edit(//**/.agents/state/approvals-log.jsonl)", "Read(//**/.agents/state/dashboard.token)"];
  const deny = ["Edit(//**/docs/references/**)", ...approvalDeny];
  const others = {
    hooks: {
      Stop: [{ hooks: [{ type: "command", command: "other-stop-1" }] }, { hooks: [{ type: "command", command: "other-stop-2" }] }],
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "other-bash" }] }],
    },
    permissions: { allow: ["Bash(ls)"] },
  };

  it("새 파일: permissions.deny → hooks 순서, 키 표기", () => {
    const r = ok(settings.merge(null, want));
    const j = JSON.parse(r.text);
    expect(Object.keys(j)).toEqual(["permissions", "hooks"]);
    expect(j.permissions).toEqual({ deny });
    expect(Object.keys(j.hooks)).toEqual(["SessionStart", "PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop", "SubagentStop", "SessionEnd", "WorktreeCreate", "WorktreeRemove"]);
    expect(r.keys).toEqual([
      ...deny.map((rule) => `permissions.deny:${rule}`),
      // HK-24: hooks.json 순서. 세션 시작 등록은 harness-session-start 안에서 한다(design §6)
      "hooks.SessionStart:harness-session-start",
      "hooks.PreToolUse:harness-protect-sources",
      "hooks.PreToolUse:harness-protect-generated",
      "hooks.PreToolUse:harness-block-full-verify",
      "hooks.PreToolUse:harness-protect-approvals",
      "hooks.PostToolUse:harness-sync-projection",
      "hooks.UserPromptSubmit:harness-session-prompt",
      "hooks.Stop:harness-verify-gate",
      "hooks.Stop:harness-session-idle",
      "hooks.SubagentStop:harness-subagent-cap",
      "hooks.SessionEnd:harness-session-end",
      "hooks.WorktreeCreate:harness-worktree-create",
      "hooks.WorktreeRemove:harness-worktree-remove",
    ]);
    // 모든 킷 훅은 디스패처를 거치고 timeout 을 가진다(R2)
    expect(j.hooks.Stop[0].hooks[0]).toEqual({ type: "command", command: dispatch("harness-verify-gate", "verify-gate.sh"), timeout: 180 });
    expect(j.hooks.PreToolUse.map((g: any) => g.matcher)).toEqual(["Write|Edit|MultiEdit|NotebookEdit", "Bash", "Write|Edit|MultiEdit|NotebookEdit|Bash"]);
    // HK-15: worktree 훅도 디스패처를 거치고 matcher 가 없다
    expect(j.hooks.WorktreeCreate[0]).toEqual({ hooks: [{ type: "command", command: dispatch("harness-worktree-create", "worktree-create.sh"), timeout: 60 }] });
    expect(j.hooks.WorktreeRemove[0].hooks[0].timeout).toBe(60);
    expect(j.hooks.SessionStart[0].hooks[0].command).toBe(`KNS_HARNESS=claude ${dispatch("harness-session-start", "session-start.sh")}`);
    expect(r.text).toBe(`${JSON.stringify(j, null, 2)}\n`);
    expect(r.created).toBe(true);
    expect(JSON.stringify(j)).not.toMatch(/defaultMode|enabledPlugins/);
  });

  it("다른 도구 훅 3개의 내용 · 순서가 병합 · 다시 병합 · 빼기 뒤에도 같다(03 §5 #6)", () => {
    const start = `${JSON.stringify(others, null, 2)}\n`;
    const once = ok(settings.merge(start, want));
    const j = JSON.parse(once.text);
    expect(j.hooks.Stop.map((g: any) => g.hooks[0].command)).toEqual(["other-stop-1", "other-stop-2", dispatch("harness-verify-gate", "verify-gate.sh")]);
    expect(j.hooks.PreToolUse[0]).toEqual(others.hooks.PreToolUse[0]);
    expect(j.permissions).toEqual({ allow: ["Bash(ls)"], deny });
    expect(ok(settings.merge(once.text, want, once.keys)).text).toBe(once.text);
    const back = settings.unmerge(once.text, once.keys, want);
    expect(back).toEqual({ ok: true, text: start, empty: false });
  });

  it("v1 킷 항목(명령 꼬리)은 자리를 지켜 바꾸고, 섞인 그룹은 킷 항목만 뺀다", () => {
    const v1 = {
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: 'bash "$CLAUDE_PROJECT_DIR"/scripts/hooks/verify-gate.sh' }] },
          { hooks: [{ type: "command", command: "other-stop" }] },
        ],
        SessionStart: [{ hooks: [{ type: "command", command: "mine" }, { type: "command", command: 'bash "$CLAUDE_PROJECT_DIR"/scripts/hooks/session-start.sh' }] }],
      },
    };
    const j = JSON.parse(ok(settings.merge(`${JSON.stringify(v1, null, 2)}\n`, want)).text);
    expect(j.hooks.Stop[0].hooks[0].timeout).toBe(180);
    expect(j.hooks.Stop[1].hooks[0].command).toBe("other-stop");
    expect(j.hooks.SessionStart[0].hooks).toEqual([{ type: "command", command: "mine" }]);
    expect(j.hooks.SessionStart).toHaveLength(2);
  });

  it("HK-13 판 킷 명령(스크립트 직접 · KNS_HARNESS 접두)도 킷 항목으로 바꾸고, `knots-sync` 낱말이 든 사람 훅은 둔다", () => {
    const old = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: 'KNS_HARNESS=claude bash "$CLAUDE_PROJECT_DIR"/scripts/hooks/session-register.sh' }] },
          { hooks: [{ type: "command", command: "npx knots-sync doctor --quiet" }] },
        ],
        PreToolUse: [{ matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash", hooks: [{ type: "command", command: 'bash "$CLAUDE_PROJECT_DIR"/scripts/hooks/protect-approvals.sh' }] }],
      },
    };
    const j = JSON.parse(ok(settings.merge(`${JSON.stringify(old, null, 2)}\n`, want)).text);
    const commands = Object.values(j.hooks).flatMap((groups: any) => groups.flatMap((g: any) => g.hooks.map((h: any) => h.command)));
    expect(commands.filter((c: string) => !c.includes("dispatch.sh"))).toEqual(["npx knots-sync doctor --quiet"]);
    expect(j.hooks.SessionStart.map((g: any) => g.hooks[0].command)).toEqual([`KNS_HARNESS=claude ${dispatch("harness-session-start", "session-start.sh")}`, "npx knots-sync doctor --quiet"]);
  });

  it("deny: lock 키에 있는데 이번에 원하지 않으면 뺀다 · 다른 값은 둔다", () => {
    const cur = `${JSON.stringify({ permissions: { deny: ["Edit(//**/old/**)", "Read(.env)"] } }, null, 2)}\n`;
    const r = ok(settings.merge(cur, want, ["permissions.deny:Edit(//**/old/**)"]));
    expect(JSON.parse(r.text).permissions.deny).toEqual(["Read(.env)", ...deny]);
  });

  it("해석할 수 없으면 conflict, 키 확인", () => {
    expect(settings.merge("{ 깨짐", want).ok).toBe(false);
    const r = ok(settings.merge(null, want));
    expect(settings.missing(r.text, r.keys, want)).toEqual([]);
    expect(settings.missing("{}\n", r.keys, want)).toEqual(r.keys);
    expect(settings.unmerge(r.text, r.keys, want)).toEqual({ ok: true, text: "{}\n", empty: true });
  });
});

describe(".codex/hooks.json(HK-24 design §3)", () => {
  const codexHooks = MERGERS["codex-hooks"];
  const want = codexHooksWant(settingsHooks(kitHooks, "codex", spec.hookMap, []), suffixes);
  const v1 = {
    hooks: {
      SessionStart: [{ hooks: [{ type: "command", command: "bash -c 'r=\"$PWD\"; …' _ session-start.sh", timeout: 15 }] }],
      Stop: [{ hooks: [{ type: "command", command: "other-stop" }] }, { hooks: [{ type: "command", command: "bash -c '…' _ verify-gate.sh", timeout: 180 }] }],
    },
  };

  it("새 파일: Codex 이벤트 · apply_patch|Bash · 디스패처 명령, user-prompt · session-end 는 없다", () => {
    const r = ok(codexHooks.merge(null, want));
    const j = JSON.parse(r.text);
    expect(Object.keys(j)).toEqual(["hooks"]);
    expect(Object.keys(j.hooks)).toEqual(["SessionStart", "PreToolUse", "PostToolUse", "Stop"]);
    expect(j.hooks.PreToolUse.map((g: any) => g.matcher)).toEqual(["apply_patch|Bash", "Bash"]);
    expect(j.hooks.SessionStart[0].hooks[0].command).toMatch(/^KNS_HARNESS=codex bash -c 'r="\$PWD"; .*\.agents\/knots-sync\.json.*dispatch\.sh" "\$1" "\$2"' _ harness-session-start scripts\/hooks\/session-start\.sh$/);
    expect(r.keys).toContain("hooks.Stop:harness-verify-gate");
    expect(r.created).toBe(true);
    expect(codexHooks.missing(r.text, r.keys, want)).toEqual([]);
    expect(codexHooks.unmerge(r.text, r.keys, want)).toEqual({ ok: true, text: "{}\n", empty: true });
  });

  it("v1 판(_ <스크립트> 꼬리)은 자리를 지켜 바꾸고 다른 도구 항목 · 순서는 둔다", () => {
    const start = `${JSON.stringify(v1, null, 2)}\n`;
    const once = ok(codexHooks.merge(start, want));
    const j = JSON.parse(once.text);
    expect(j.hooks.Stop.map((g: any) => g.hooks[0].command)).toEqual(["other-stop", expect.stringContaining(" _ harness-verify-gate scripts/hooks/verify-gate.sh")]);
    expect(j.hooks.SessionStart).toHaveLength(1);
    expect(ok(codexHooks.merge(once.text, want, once.keys)).text).toBe(once.text);
    const back = JSON.parse(ok(codexHooks.unmerge(once.text, once.keys, want)).text);
    expect(back.hooks.Stop.map((g: any) => g.hooks[0].command)).toEqual(["other-stop"]);
  });

  it("최상위에 다른 키가 있으면 두고, 해석할 수 없으면 conflict", () => {
    const r = ok(codexHooks.merge('{\n  "x": 1\n}\n', want));
    expect(Object.keys(JSON.parse(r.text))).toEqual(["x", "hooks"]);
    expect(codexHooks.merge("{ 깨짐", want).ok).toBe(false);
  });
});

describe("config.toml(§5.3)", () => {
  const roles = [
    { name: "worker", description: "구현한다" },
    { name: "explorer", description: '근거 "찾기"' },
  ];
  const want = codexConfigWant(spec, roles);
  const header = `${spec.codexConfig.header.join("\n")}\n`;

  it("새 파일: 머리 · 기본 표 · 소유 표(이름순)", () => {
    const r = ok(codex.merge(null, want));
    expect(r.text.startsWith(`${header}\n[features]\nmulti_agent = true\n\n[agents]\nmax_threads = 6\n\n[shell_environment_policy]\n`)).toBe(true);
    expect(r.text.endsWith('\n[agents.explorer]\ndescription = "근거 \\"찾기\\""\nconfig_file = "agents/explorer.toml"\n\n[agents.worker]\ndescription = "구현한다"\nconfig_file = "agents/worker.toml"\n')).toBe(true);
    expect(r.keys).toEqual(["toml:features.multi_agent", "toml:agents.max_threads", "toml:shell_environment_policy", "toml:agents.explorer", "toml:agents.worker"]);
    expect(ok(codex.merge(r.text, want, r.keys)).text).toBe(r.text);
    expect(codex.unmerge(r.text, r.keys, want)).toMatchObject({ ok: true, empty: true });
  });

  it("사람 값은 두고 없는 키만 넣는다 · 소유 표는 통째 바꾼다 · 원하지 않는 소유 표는 뺀다", () => {
    const cur = '# 사람\nmodel = "mine"\n\n[features]\nweb = true\n\n[agents]\nmax_threads = 2\n\n[agents.worker]\ndescription = "옛"\nconfig_file = "x"\n\n[agents.old]\ndescription = "빠질 표"\nconfig_file = "agents/old.toml"\n\n[mcp_servers.x]\ncommand = "y"\n';
    const r = ok(codex.merge(cur, want, ["toml:agents.old", "toml:agents.worker"]));
    expect(r.text).toContain('model = "mine"');
    expect(r.text).toContain("[features]\nweb = true\nmulti_agent = true\n");
    expect(r.text).toContain("[agents]\nmax_threads = 2\n");
    expect(r.text).toContain('[agents.worker]\ndescription = "구현한다"\nconfig_file = "agents/worker.toml"\n');
    expect(r.text).not.toContain("agents.old");
    expect(r.text).toContain('[mcp_servers.x]\ncommand = "y"\n');
    expect(r.keys).toEqual(["toml:features.multi_agent", "toml:shell_environment_policy", "toml:agents.explorer", "toml:agents.worker"]);
    const back = codex.unmerge(r.text, r.keys, want);
    expect(back.ok && back.text).toContain("max_threads = 2");
    expect(back.ok && back.text).not.toContain("multi_agent");
    expect(codex.missing(r.text, r.keys, want)).toEqual([]);
  });
});

describe(".gitattributes(§5.4)", () => {
  it("깐 하네스의 생성 경로만, 블록 밖은 그대로", () => {
    const want = gitattributesWant(spec, ["kiro", "claude"]);
    const r = ok(attrs.merge("*.png binary\n", want));
    expect(r.text).toBe(
      "*.png binary\n\n# knots-sync:begin generated — .agents/ 원본에서 만든 파일이다. 고칠 때는 원본을 고친다\n" +
        ".claude/skills/** linguist-generated=true\n.claude/rules/** linguist-generated=true\n.claude/agents/** linguist-generated=true\n" +
        ".kiro/skills/** linguist-generated=true\n.kiro/steering/** linguist-generated=true\n.kiro/agents/** linguist-generated=true\n.kiro/hooks/harness-* linguist-generated=true\n# knots-sync:end generated\n",
    );
    expect(r.keys).toEqual(["block:generated"]);
    const only = ok(attrs.merge(r.text, gitattributesWant(spec, ["codex"]), r.keys));
    expect(only.text).toContain(".codex/agents/** linguist-generated=true\n# knots-sync:end generated\n");
    expect(only.text).not.toContain(".claude/");
    expect(attrs.unmerge(r.text, r.keys, want)).toEqual({ ok: true, text: "*.png binary\n", empty: false });
  });
});
