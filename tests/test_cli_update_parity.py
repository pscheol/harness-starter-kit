"""setup.sh 로 깐 리포에서 update.sh ↔ CLI update 동일성 시험(HK-11 R7.2 · R3.2, design §6.2).

    python3 -m unittest tests.test_cli_update_parity

옛 킷(플러그인 사본 + 시험 파일)의 setup.sh 로 한 번 깔고 두 벌로 복사한다. 같은 사람 수정을 두 벌에 하고,
한 벌에는 새 킷의 update.sh, 다른 벌에는 `node <cli> update --templates <새 킷 템플릿>` 을 돌린다.
기대값은 모두 두 결과의 비교다(고정값 없음). HK-9 · HK-10 이 템플릿 · layout · update.sh 를 바꿔도 시험은 그대로 돈다.
lock · 메타 · .agents/state/ 는 파일 비교에서 빼고 의미로 본다. 네트워크를 쓰지 않는다.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cli_dist  # noqa: E402
from test_cli_parity import DEFAULT_TOKENS, base_env, lock_hashes  # noqa: E402

KIT = cli_dist.KIT
PLUGIN = KIT / "plugins/harness-kit"
KIT_PARTS = (".claude-plugin", "skills/hx-bootstrap", "skills/hx-update")
LOCK = ".agents/harness-kit.lock"
META = ".agents/harness-kit.json"
STATE_DIR = ".agents/state"
# 업그레이드 공지(HK-24 design §7)는 두 경로의 새 판 값이 달라(update.sh = plugin.json 판, CLI = 패키지 판) 내용이 다르다.
# 공지 함수 동일성은 같은 입력으로 notice.test.ts 가 본다. 릴리스 스크립트(HK-22)가 판을 하나로 맞추면 다시 비교한다.
NOTICE = ".agents/harness-upgrade-notice.md"
SKIP = {LOCK, META, NOTICE}

# 옛 킷에만 있는 시험 파일(새 킷에서 뺀다). ONLY 는 혼자 든 폴더라 --prune 이 폴더까지 지운다.
ONLY = ("common/zz-hk11-old/only.md", "zz-hk11-old/only.md")
GONE_EDITED = ("common/agents-rules/zz-hk11-gone-edited.md", ".agents/rules/zz-hk11-gone-edited.md")
# 새 킷에만 있는 파일
NEW_RULE = ("common/agents-rules/zz-hk11-new.md", ".agents/rules/zz-hk11-new.md")
NEW_TOOL = ("common/scripts/zz-hk11-tool.sh", "scripts/zz-hk11-tool.sh")


def other_layer_tails(templates: Path) -> set[str]:
    """common 밖 레이어(domains · stacks · arch · optional)에 있는 '<세그먼트>/<이름>' 꼬리. 겹치는 경로를 고르지 않으려고 쓴다."""
    tails: set[str] = set()
    for top in ("domains", "stacks", "optional"):
        for p in (templates / top).rglob("*"):
            if p.is_file():
                parts = p.relative_to(templates).parts
                for i in range(len(parts) - 1):
                    if parts[i] in ("agents-rules", "scripts"):
                        tails.add("/".join(parts[i:]))
    return tails


# HK-25: 머리 줄(HARNESS STARTER KIT) 없는 문서 · 있는 문서. 다른 레이어에 같은 경로가 없다.
PLAIN_DOC = ("common/agents-docs/guides/doc-standards.md", ".agents/docs/guides/doc-standards.md")
HEADER_DOC = ("common/agents-docs/tech-debt-tracker.md", ".agents/docs/tech-debt-tracker.md")
PLAIN_LAST = "새 판 마지막 줄(HK-25)"
MERGE_BEGIN = "<!-- harness-kit: 설치 전 내용(병합) -->"
MERGE_END = "<!-- /harness-kit -->"
BACKUPS = ".agents/state/merge-backup"


@dataclass(frozen=True)
class Picks:
    """새 킷이 바꾸는 템플릿(템플릿 상대 경로, 설치 경로)."""

    changed: tuple[str, str]   # 킷이 바꾸는 규칙
    kept: tuple[str, str]      # 킷이 안 바꾸는 규칙
    script: tuple[str, str]    # 킷이 바꾸는 실행 파일
    removed: tuple[str, str]   # 킷에서 빼는 규칙
    deleted: tuple[str, str]   # 사람이 지우는 규칙(킷은 그대로)
    plain_doc: tuple[str, str] = PLAIN_DOC    # 킷이 마지막 줄을 바꾸는 머리 줄 없는 문서(HK-25 줄 병합)
    header_doc: tuple[str, str] = HEADER_DOC  # 킷이 줄을 더하는 머리 줄 있는 문서(HK-25 킷 판)


def pick(templates: Path) -> Picks:
    tails = other_layer_tails(templates)
    rules = sorted(p.name for p in (templates / "common/agents-rules").glob("*.md") if f"agents-rules/{p.name}" not in tails)
    scripts = sorted(p.name for p in (templates / "common/scripts").glob("*.sh") if f"scripts/{p.name}" not in tails)
    assert len(rules) >= 4 and scripts, (rules, scripts)

    def rule(name: str) -> tuple[str, str]:
        return (f"common/agents-rules/{name}", f".agents/rules/{name}")

    return Picks(rule(rules[0]), rule(rules[1]), (f"common/scripts/{scripts[0]}", f"scripts/{scripts[0]}"), rule(rules[2]), rule(rules[3]))


def make_old_kit(root: Path) -> Path:
    kit = root / "old"
    for part in KIT_PARTS:
        shutil.copytree(PLUGIN / part, kit / part, symlinks=True)
    tpl = kit / "skills/hx-bootstrap/templates"
    for rel, body in ((ONLY[0], "혼자 든 파일 {{PROJECT_NAME}}\n"), (GONE_EDITED[0], "빠질 규칙\n")):
        (tpl / rel).parent.mkdir(parents=True, exist_ok=True)
        (tpl / rel).write_text(body, encoding="utf-8")
    return kit


# platform-guards 모듈이 common 과 같은 경로에 깔던 파일(HK-25 R2 — 모듈을 없앴다. 옛 설치의 lock 레이어만 남는다).
GUARD_PATHS = (".agents/rules/platform-invariants.md", "scripts/run-guards.sh", "scripts/guards/_template.sh")
RETIRED_NOTE = "platform-guards 모듈은 공통 층에 포함됨"
PRE_AGENTS = "# 손으로 쓴 AGENTS — 설치 전부터 있었다\n"
LOCK_MARK = "# pre-existing: -"


def make_new_kit(root: Path, old: Path, picks: Picks) -> Path:
    kit = root / "new"
    shutil.copytree(old, kit, symlinks=True)
    tpl = kit / "skills/hx-bootstrap/templates"
    for rel in (picks.changed[0], picks.script[0], picks.header_doc[0]):
        with (tpl / rel).open("a", encoding="utf-8") as f:
            f.write("\n<!-- HK-11 새 판 줄 -->\n" if rel.endswith(".md") else "\n# HK-11 새 판 줄\n")
    doc = tpl / picks.plain_doc[0]
    lines = doc.read_text(encoding="utf-8").split("\n")
    last = max(i for i, line in enumerate(lines) if any(ch.isalnum() for ch in line))
    lines[last] = PLAIN_LAST
    doc.write_text("\n".join(lines), encoding="utf-8")
    (tpl / NEW_RULE[0]).write_text("새 규칙 {{PROJECT_NAME}}\n", encoding="utf-8")
    (tpl / NEW_TOOL[0]).write_text("#!/usr/bin/env bash\necho {{PROJECT_SLUG}}\n", encoding="utf-8")
    for rel in (picks.removed[0], ONLY[0], GONE_EDITED[0]):
        (tpl / rel).unlink()
    (tpl / ONLY[0]).parent.rmdir()
    return kit


Edit = Callable[[Path, Picks], None]


def no_edits(target: Path, picks: Picks) -> None:
    meta = json.loads((target / META).read_text(encoding="utf-8"))
    meta["teamNote"] = "사람이 더한 키"
    (target / META).write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def append(target: Path, rel: str, line: str = "사람이 더한 줄\n") -> None:
    with (target / rel).open("a", encoding="utf-8") as f:
        f.write(line)


def user_edits(target: Path, picks: Picks) -> None:
    append(target, picks.changed[1])
    append(target, picks.kept[1])
    (target / picks.deleted[1]).unlink()
    (target / f"{picks.changed[1]}.new").write_text("묵은 .new\n", encoding="utf-8")


def edit_gone(target: Path, picks: Picks) -> None:
    append(target, GONE_EDITED[1])


def user_owned(target: Path, picks: Picks) -> None:
    (target / "notes").mkdir()
    (target / "notes/mine.md").write_text("사람 메모\n", encoding="utf-8")
    (target / NEW_RULE[1]).write_text("사람이 먼저 둔 같은 경로 파일\n", encoding="utf-8")


def two_edits(target: Path, picks: Picks) -> None:
    append(target, picks.changed[1])
    append(target, picks.kept[1])


def stale_board(target: Path, picks: Picks) -> None:
    """v1.0.8 리포: 옛 구조 이슈가 있고 specs-index.md 보드가 옛 형식이다(HK-9 R9.3 시험과 같다)."""
    issue = target / ".agents/docs/demo-specs/issues/1-feat-sample"
    issue.mkdir(parents=True)
    (issue / "requirements.md").write_text("# Requirements — 1-feat-sample\n\n| 상태 | approved |\n", encoding="utf-8")
    index = target / ".agents/docs/specs-index.md"
    old_board = "\n## 전체 보드 (전 제품)\n\n| 📋 요구 (1) | 🎨 설계 (0) |\n|---|---|\n| `demo/1-feat-sample` | — |\n\n"
    text = re.sub(r"(<!-- BOARD:BEGIN[^\n]*-->\n).*?(<!-- BOARD:END -->)", lambda m: m[1] + old_board + m[2], index.read_text(encoding="utf-8"), flags=re.S)
    index.write_text(text, encoding="utf-8")


def pre_agents(target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    (target / "AGENTS.md").write_text(PRE_AGENTS, encoding="utf-8")


def legacy_lock(target: Path, picks: Picks) -> None:
    """v1.0.8 setup.sh 가 쓴 lock 을 흉내 낸다: 표시 줄이 없고 미리 있던 AGENTS.md 를 그 파일 해시로 적었다(R12.6)."""
    out = []
    for line in (target / LOCK).read_text(encoding="utf-8").splitlines():
        if line == LOCK_MARK:
            continue
        if line.endswith("\tAGENTS.md"):
            line = hashlib.sha256((target / "AGENTS.md").read_bytes()).hexdigest() + line[line.index("\t"):]
        out.append(line)
    (target / LOCK).write_text("\n".join(out) + "\n", encoding="utf-8")


def nothing(target: Path, picks: Picks) -> None:
    return None


def guards_meta(target: Path, picks: Picks) -> None:
    """platform-guards 모듈을 켰던 옛 설치: 메타 modules 에 이름이 있고, 겹치던 3경로의 lock 레이어가 모듈이다."""
    meta = json.loads((target / META).read_text(encoding="utf-8"))
    meta["modules"] = ["platform-guards"]
    (target / META).write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    out = []
    for line in (target / LOCK).read_text(encoding="utf-8").splitlines():
        cols = line.split("\t")
        if len(cols) == 4 and cols[3] in GUARD_PATHS:
            cols[1] = "mod/platform-guards"
        out.append("\t".join(cols))
    (target / LOCK).write_text("\n".join(out) + "\n", encoding="utf-8")


# HK-25 #11: 설치 전부터 있던 사람 파일(문서 · JSON · 스크립트 · CLAUDE.md). v1.0.8 lock 은 그 파일 해시를 적었다.
PRE_FILES = {
    "README.md": "# 우리 서비스\n\n사람이 쓴 소개 문단이다.\n",
    ".agents/verify-checks.json": '{"checks": [], "teamOnly": true}\n',
    "CLAUDE.md": "# 우리 팀 CLAUDE\n사람이 쓴 안내\n",
}


def pre_mixed(target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    for rel, body in PRE_FILES.items():
        (target / rel).parent.mkdir(parents=True, exist_ok=True)
        (target / rel).write_text(body, encoding="utf-8")


def legacy_lock_all(target: Path, picks: Picks) -> None:
    """표시 줄을 지우고 미리 있던 파일(PRE_FILES · 킷이 바꿀 스크립트)의 해시를 그 파일 해시로 적는다(v1.0.8 setup.sh)."""
    (target / picks.script[1]).write_text("#!/usr/bin/env bash\necho 사람이 둔 스크립트\n", encoding="utf-8")
    # v1.0.8 setup.sh 는 미리 있던 CLAUDE.md 를 건너뛰었다(지금 판은 블록을 덧붙인다) — 사람 판으로 되돌린다.
    (target / "CLAUDE.md").write_text(PRE_FILES["CLAUDE.md"], encoding="utf-8")
    pre = {*PRE_FILES, picks.script[1]}
    out = []
    for line in (target / LOCK).read_text(encoding="utf-8").splitlines():
        if line == LOCK_MARK:
            continue
        cols = line.split("\t")
        if len(cols) == 4 and cols[3] in pre and cols[1] not in ("mirror", "render", "merge", "merge+"):
            cols[0] = hashlib.sha256((target / cols[3]).read_bytes()).hexdigest()
        out.append("\t".join(cols))
    if not any(line.endswith("\tCLAUDE.md") and "\tmerge" not in line for line in out):
        out = [line for line in out if not line.endswith("\tCLAUDE.md")]
        out.append(hashlib.sha256((target / "CLAUDE.md").read_bytes()).hexdigest() + "\tpython\tclaude\tCLAUDE.md")
    (target / LOCK).write_text("\n".join(out) + "\n", encoding="utf-8")


def split_blocks(text: str) -> tuple[list[str], list[str]]:
    """병합본 → (표지 밖 줄, 표지 안 줄)."""
    outside: list[str] = []
    inside: list[str] = []
    inner = False
    for line in text.split("\n"):
        if line == MERGE_BEGIN:
            inner = True
        elif line == MERGE_END:
            inner = False
        else:
            (inside if inner else outside).append(line)
    return outside, inside


def significant(line: str) -> bool:
    return any(("A" <= ch <= "Z") or ("a" <= ch <= "z") or ("0" <= ch <= "9") or ord(ch) >= 0x80 for ch in line)


def backups(target: Path) -> dict[str, bytes]:
    """merge-backup/<시각>/ 아래 파일(시각 폴더는 하나)."""
    root = target / BACKUPS
    stamps = sorted(p.name for p in root.iterdir()) if root.is_dir() else []
    assert len(stamps) <= 1, stamps
    if not stamps:
        return {}
    base = root / stamps[0]
    return {p.relative_to(base).as_posix().removesuffix(".orig"): p.read_bytes() for p in base.rglob("*") if p.is_file() and p.name.endswith(".orig")}


@dataclass(frozen=True)
class Case:
    name: str
    stack: str
    arch: str
    agents: str
    edit: Edit
    cli_flags: tuple[str, ...] = ()
    sh_flags: tuple[str, ...] = ()
    tokens: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_TOKENS))
    modules: str = "none"
    # 설치 전에 대상 폴더에 둘 것(설치 전부터 있던 파일)
    prep: Callable[[Path], None] | None = None


CASES = (
    Case("01-no-edits", "jvm", "hexagonal", "all", no_edits),
    Case("02-user-edits", "python", "hexagonal", "claude,kiro", user_edits),
    Case("03-orphans", "go", "hexagonal", "codex", edit_gone),
    Case("04-orphans-prune", "go", "hexagonal", "codex", edit_gone, cli_flags=("--prune",)),
    Case("05-user-owned", "web", "nextjs-app", "claude", user_owned),
    Case("06-accept-all", "jvm", "layered", "claude", two_edits, cli_flags=("--accept-all",), sh_flags=("--accept-all",)),
    Case("07-retired-guards-module", "python", "layered", "claude,kiro", guards_meta),
    Case("08-board-rebuild", "go", "hexagonal", "codex", stale_board),
    Case("09-pre-existing-legacy-lock", "jvm", "hexagonal", "claude", legacy_lock, prep=pre_agents),
    Case("10-pre-existing-marked-lock", "jvm", "hexagonal", "claude", nothing, prep=pre_agents),
    Case("11-legacy-lock-merge", "python", "layered", "claude,kiro", legacy_lock_all, prep=pre_mixed),
)


def snapshot(root: Path) -> tuple[dict[str, tuple[str, bytes, int]], set[str]]:
    files: dict[str, tuple[str, bytes, int]] = {}
    dirs: set[str] = set()
    for dirpath, dirnames, filenames in os.walk(root):
        base = Path(dirpath)
        rel_base = base.relative_to(root).as_posix()
        if rel_base == STATE_DIR or rel_base.startswith(STATE_DIR + "/"):
            continue
        for d in dirnames:
            p = base / d
            rel = p.relative_to(root).as_posix()
            if rel == STATE_DIR:
                continue
            if p.is_symlink():
                files[rel] = ("link", os.readlink(p).encode(), 0)
            else:
                dirs.add(rel)
        for f in filenames:
            p = base / f
            rel = p.relative_to(root).as_posix()
            if rel in SKIP:
                continue
            st = p.lstat()
            if stat.S_ISLNK(st.st_mode):
                files[rel] = ("link", os.readlink(p).encode(), 0)
            else:
                files[rel] = ("file", p.read_bytes(), stat.S_IMODE(st.st_mode))
    return files, dirs


@dataclass
class Outcome:
    case: Case
    base: Path
    sh: Path
    cli: Path
    sh_run: subprocess.CompletedProcess
    cli_run: subprocess.CompletedProcess


def run_case(cli: Path, root: Path, old: Path, new: Path, picks: Picks, c: Case) -> Outcome:
    work = root / c.name
    base = work / "base" / "acme-notes"
    base.mkdir(parents=True)
    if c.prep:
        c.prep(base)
    setup = [
        "bash", str(old / "skills/hx-bootstrap/setup.sh"), f"--stack={c.stack}", f"--arch={c.arch}",
        f"--agents={c.agents}", f"--modules={c.modules}", str(base),
    ]
    r = subprocess.run(setup, env=base_env(c.tokens), capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(f"{c.name} setup.sh 실패: {r.stderr[-2000:]}")
    c.edit(base, picks)
    sh = work / "sh" / "acme-notes"
    cl = work / "cli" / "acme-notes"
    for target in (sh, cl):
        shutil.copytree(base, target, symlinks=True)
    env = base_env({})
    sh_run = subprocess.run(["bash", str(new / "skills/hx-update/update.sh"), *c.sh_flags, str(sh)],
                            env=env, capture_output=True, text=True, timeout=300)
    cli_run = subprocess.run(["node", str(cli), "update", "--json", "--templates", str(new / "skills/hx-bootstrap/templates"),
                              "--cwd", str(cl), *c.cli_flags], env=env, capture_output=True, text=True, timeout=300)
    return Outcome(c, base, sh, cl, sh_run, cli_run)


@unittest.skipUnless(shutil.which("node"), "Node 18.3 이상이 필요하다")
class CliUpdateParityTest(unittest.TestCase):
    outcomes: dict[str, Outcome] = {}

    @classmethod
    def setUpClass(cls):
        cls.cli = cli_dist.cli_bundle()
        cls.tmp = Path(tempfile.mkdtemp(prefix="hk-update-parity-")).resolve()
        old = make_old_kit(cls.tmp)
        cls.picks = pick(old / "skills/hx-bootstrap/templates")
        cls.new = make_new_kit(cls.tmp, old, cls.picks)
        with ThreadPoolExecutor(max_workers=4) as pool:
            done = list(pool.map(lambda c: run_case(cls.cli, cls.tmp, old, cls.new, cls.picks, c), CASES))
        cls.outcomes = {o.case.name: o for o in done}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def ran(self, name: str) -> tuple[Outcome, dict]:
        o = self.outcomes[name]
        self.assertEqual(o.sh_run.returncode, 0, o.sh_run.stdout[-1500:] + o.sh_run.stderr[-1500:])
        self.assertIn(o.cli_run.returncode, (0, 4), o.cli_run.stdout[-1500:] + o.cli_run.stderr[-1500:])
        self.assertEqual(o.cli_run.stderr, "")
        return o, json.loads(o.cli_run.stdout)

    def assert_same_tree(self, o: Outcome, *, drop_sh: set[str] = frozenset(), drop_cli: set[str] = frozenset(), dirs: bool = True) -> None:
        sh_files, sh_dirs = snapshot(o.sh)
        cl_files, cl_dirs = snapshot(o.cli)
        for rel in drop_sh:
            self.assertIn(rel, sh_files, f"update.sh 쪽에 {rel} 가 있어야 한다")
            del sh_files[rel]
        for rel in drop_cli:
            self.assertIn(rel, cl_files, f"CLI 쪽에 {rel} 가 있어야 한다")
            del cl_files[rel]
        self.assertEqual(sorted(set(sh_files) - set(cl_files)), [], "update.sh 에만 있는 파일")
        self.assertEqual(sorted(set(cl_files) - set(sh_files)), [], "CLI 에만 있는 파일")
        self.assertEqual(sorted(r for r in sh_files if sh_files[r][1] != cl_files[r][1]), [], "내용")
        modes = sorted(f"{r} {oct(sh_files[r][2])}≠{oct(cl_files[r][2])}" for r in sh_files if sh_files[r][2] != cl_files[r][2])
        self.assertEqual(modes, [], "권한 비트")
        if dirs:
            self.assertEqual(sorted(sh_dirs ^ cl_dirs), [], "폴더 목록")
        self.assertGreater(len(sh_files), 100)

    def assert_lock_means_same(self, o: Outcome, *, pruned: set[str] = frozenset(), user: set[str] = frozenset(),
                               cli_only: set[str] = frozenset()) -> None:
        old = lock_hashes(o.base / LOCK)
        sh = lock_hashes(o.sh / LOCK)
        lock = json.loads((o.cli / LOCK).read_text(encoding="utf-8"))
        self.assertEqual(lock["schema"], "harness-kit.lock/v2")
        entries = {e["path"]: e for e in lock["entries"]}
        self.assertEqual(set(entries), (set(old) | set(sh) | cli_only) - pruned, "lock 경로 = 옛 v1 경로 ∪ update.sh 새 경로 − prune")
        for rel, e in entries.items():
            if rel in user:
                self.assertEqual((e["owner"], e.get("sha256")), ("user", None), rel)
            elif rel in sh:
                self.assertEqual(e.get("sha256") or "-", sh[rel], rel)
        backup = o.cli / STATE_DIR / "harness-kit.lock.v1.bak"
        self.assertEqual(backup.read_bytes(), (o.base / LOCK).read_bytes())

    def assert_meta_means_same(self, o: Outcome) -> dict:
        sh = json.loads((o.sh / META).read_text(encoding="utf-8"))
        cl = json.loads((o.cli / META).read_text(encoding="utf-8"))
        for k in ("stack", "arch", "domain", "agents", "modules", "tokens"):
            self.assertEqual(cl.get(k), sh.get(k), k)
        self.assertEqual(cl["schema"], "harness-kit/v2")
        self.assertNotIn("kitVersion", cl)
        return cl

    def test_01_no_edits(self):
        o, j = self.ran("01-no-edits")
        self.assertEqual(o.cli_run.returncode, 0)
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        meta = self.assert_meta_means_same(o)
        self.assertEqual(meta["teamNote"], "사람이 더한 키")
        self.assertEqual(j["formats"], {"meta": "v1", "lock": "v1"})
        self.assertEqual(j["counts"]["new"], 2)
        self.assertEqual(j["counts"]["conflict"], 0)
        d = subprocess.run(["node", str(self.cli), "doctor", "--check", "--json", "--cwd", str(o.cli)], capture_output=True, text=True, timeout=120)
        self.assertEqual(d.returncode, 0, d.stdout[-2000:])
        self.assertNotIn("lock-v1", [f["kind"] for f in json.loads(d.stdout)["findings"]])

    def test_02_user_edits_get_new_files(self):
        o, j = self.ran("02-user-edits")
        self.assertEqual(o.cli_run.returncode, 4)
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        self.assert_meta_means_same(o)
        sh_new = sorted(p.removesuffix(".new") for p in snapshot(o.sh)[0] if p.endswith(".new"))
        self.assertEqual(sorted(c["path"] for c in j["conflicts"]), sh_new)
        self.assertEqual(sh_new, sorted([self.picks.changed[1], self.picks.kept[1]]))
        self.assertTrue((o.cli / self.picks.deleted[1]).is_file())

    def test_03_orphans_are_kept(self):
        o, j = self.ran("03-orphans")
        self.assertEqual(o.cli_run.returncode, 0)
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        orphans = sorted(op["path"] for op in j["ops"] if op["action"] == "orphan")
        self.assertEqual(orphans, sorted([self.picks.removed[1], ONLY[1], GONE_EDITED[1]]))

    def test_04_prune_removes_unmodified_orphans(self):
        o, j = self.ran("04-orphans-prune")
        self.assertEqual(o.cli_run.returncode, 4)
        pruned = {self.picks.removed[1], ONLY[1]}
        self.assert_same_tree(o, drop_sh=pruned, dirs=False)
        self.assert_lock_means_same(o, pruned=pruned)
        self.assertFalse((o.cli / "zz-hk11-old").exists())
        self.assertTrue((o.cli / GONE_EDITED[1]).is_file())
        self.assertEqual(sorted(op["path"] for op in j["ops"] if op["action"] == "delete"), sorted(pruned))

    def test_05_user_owned_files_are_left_alone(self):
        o, j = self.ran("05-user-owned")
        self.assertEqual(o.cli_run.returncode, 0)
        # design §7 U1: update.sh 는 사람 파일 옆에 .new 를 남기고, 그 원본의 배치를 미룬다(HK-13 §6.3).
        # CLI 는 .new 없이 사람 파일을 그대로 원본으로 삼아 배치한다 — 차이는 이 한 경로뿐이다.
        projected = ".claude/rules/zz-hk11-new.md"
        self.assert_same_tree(o, drop_sh={f"{NEW_RULE[1]}.new"}, drop_cli={projected})
        self.assert_lock_means_same(o, user={NEW_RULE[1]}, cli_only={projected})
        self.assertEqual((o.cli / projected).read_bytes(), (o.cli / NEW_RULE[1]).read_bytes())
        self.assertEqual((o.cli / "notes/mine.md").read_text(encoding="utf-8"), "사람 메모\n")
        self.assertEqual([op["action"] for op in j["ops"] if op["path"] == NEW_RULE[1]], ["skip-user"])
        before = snapshot(o.cli)
        again = subprocess.run(["node", str(self.cli), "update", "--json", "--templates", str(self.new / "skills/hx-bootstrap/templates"), "--cwd", str(o.cli)],
                               env=base_env({}), capture_output=True, text=True, timeout=300)
        self.assertEqual(again.returncode, 0, again.stdout[-2000:])
        self.assertEqual(snapshot(o.cli), before)

    def test_06_accept_all_keeps_bak(self):
        o, j = self.ran("06-accept-all")
        self.assertEqual(o.cli_run.returncode, 0)
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        baks = sorted(p for p in snapshot(o.cli)[0] if p.endswith(".bak"))
        self.assertEqual(baks, sorted(f"{p}.bak" for p in (self.picks.changed[1], self.picks.kept[1])))
        self.assertEqual(j["counts"]["replace"], 2)

    def test_07_retired_platform_guards_leaves_meta(self):
        """platform-guards 를 켰던 옛 설치: 두 update 모두 메타에서 이름을 빼고 한 줄 알린다. 파일은 공통 층 판 그대로(HK-25 R2)."""
        o, j = self.ran("07-retired-guards-module")
        self.assertEqual(o.cli_run.returncode, 0)
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        self.assert_meta_means_same(o)
        for target in (o.sh, o.cli):
            self.assertEqual(json.loads((target / META).read_text(encoding="utf-8"))["modules"], [], target)
            for rel in GUARD_PATHS:
                self.assertTrue((target / rel).is_file(), rel)
        self.assertEqual(o.sh_run.stdout.count(RETIRED_NOTE), 1, o.sh_run.stdout[-2000:])
        self.assertEqual(j["retiredModules"], ["platform-guards"])
        self.assertEqual(j["droppedModules"], [])
        lock = {e["path"]: e for e in json.loads((o.cli / LOCK).read_text(encoding="utf-8"))["entries"]}
        sh_layers = {line.split("\t")[3]: line.split("\t")[1] for line in (o.sh / LOCK).read_text(encoding="utf-8").splitlines() if line.count("\t") == 3}
        for rel in GUARD_PATHS:
            self.assertEqual(lock[rel]["layer"], "common", rel)
            self.assertEqual(sh_layers[rel], "common", rel)
        self.assertEqual(sorted(p for p in snapshot(o.cli)[0] if p.endswith(".new")), [])

    def test_08_board_rebuilt_like_update_sh(self):
        o, j = self.ran("08-board-rebuild")
        # 옛 형식 보드는 킷 파일(specs-index.md)을 고친 것이라 두 쪽 모두 .new 를 받는다. 보드는 그 뒤에 다시 만든다.
        self.assertEqual(o.cli_run.returncode, 4)
        self.assertEqual([c["path"] for c in j["conflicts"]], [".agents/docs/specs-index.md"])
        self.assertIn("SDD 보드", o.sh_run.stdout)
        self.assert_same_tree(o)
        self.assertEqual(j["board"], {"status": "rebuilt"})
        self.assertIn("| 1 (옛) | sample | feat |", (o.cli / ".agents/docs/specs-index.md").read_text(encoding="utf-8"))

    def test_09_pre_existing_file_with_legacy_lock_is_merged(self):
        """v1.0.8 lock: 미리 있던 사람 AGENTS.md 는 킷 판 + 사람 줄 묶음, 킷이 바꾼 규칙은 새 판, 스크립트는 .new(HK-25 R1)."""
        o, j = self.ran("09-pre-existing-legacy-lock")
        self.assertEqual(o.cli_run.returncode, 4)
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        for target in (o.sh, o.cli):
            text = (target / "AGENTS.md").read_text(encoding="utf-8")
            outside, inside = split_blocks(text)
            self.assertIn("HARNESS STARTER KIT", outside[0], target)
            self.assertEqual(inside, [PRE_AGENTS.rstrip("\n")], target)
            self.assertFalse((target / "AGENTS.md.new").exists(), target)
            self.assertFalse((target / f"{self.picks.changed[1]}.new").exists(), target)
            self.assertTrue((target / f"{self.picks.script[1]}.new").is_file(), target)
            self.assertEqual(backups(target)["AGENTS.md"], PRE_AGENTS.encode("utf-8"), target)
        sh_lock = lock_hashes(o.sh / LOCK)
        self.assertRegex(sh_lock["AGENTS.md"], r"^[0-9a-f]{64}$")
        self.assertEqual(sh_lock[self.picks.script[1]], "-")
        self.assertTrue((o.sh / LOCK).read_text(encoding="utf-8").splitlines()[1] == LOCK_MARK)
        kinds = {m["path"]: m["kind"] for m in j["merged"]}
        self.assertEqual((kinds["AGENTS.md"], kinds[self.picks.changed[1]]), ("lines", "kit"))
        self.assertEqual([c["path"] for c in j["conflicts"]], [self.picks.script[1]])
        self.assertEqual(o.sh_run.stdout.count("v1 lock 첫 업데이트"), 1)

    def test_10_pre_existing_file_with_marked_lock(self):
        o, j = self.ran("10-pre-existing-marked-lock")
        self.assertEqual(o.cli_run.returncode, 4)
        self.assertEqual(lock_hashes(o.base / LOCK)["AGENTS.md"], "-")
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        for target in (o.sh, o.cli):
            self.assertEqual((target / "AGENTS.md").read_text(encoding="utf-8"), PRE_AGENTS, target)
            self.assertTrue((target / "AGENTS.md.new").is_file(), target)
            self.assertFalse((target / f"{self.picks.changed[1]}.new").exists(), target)
        self.assertEqual([c["path"] for c in j["conflicts"]], ["AGENTS.md"])


    def test_11_legacy_lock_merges_by_file_kind(self):
        """v1.0.8 lock 첫 update: 문서 lines · JSON keys · 스크립트 .new · 머리 줄 문서 kit · CLAUDE.md 백업(HK-25 R1 · R3)."""
        o, j = self.ran("11-legacy-lock-merge")
        self.assertEqual(o.cli_run.returncode, 4)
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        kit_tpl = self.new / "skills/hx-bootstrap/templates"
        for target in (o.sh, o.cli):
            with self.subTest(target=target.parent.name):
                readme_out, readme_in = split_blocks((target / "README.md").read_text(encoding="utf-8"))
                self.assertIn("사람이 쓴 소개 문단이다.", readme_in)
                doc_out, doc_in = split_blocks((target / self.picks.plain_doc[1]).read_text(encoding="utf-8"))
                self.assertIn(PLAIN_LAST, doc_out)
                self.assertEqual(len([line for line in doc_in if significant(line)]), 1, doc_in)
                for outside, inside in ((readme_out, readme_in), (doc_out, doc_in)):
                    self.assertEqual([line for line in inside if significant(line) and line in outside], [], "두 판에 같은 줄이 두 번")
                checks = json.loads((target / ".agents/verify-checks.json").read_text(encoding="utf-8"))
                self.assertIs(checks["teamOnly"], True)
                self.assertGreater(len(checks["checks"]), 0)
                header = (target / self.picks.header_doc[1]).read_text(encoding="utf-8")
                self.assertTrue(header.endswith("<!-- HK-11 새 판 줄 -->\n"), "머리 줄 문서는 새 판")
                self.assertNotIn(MERGE_BEGIN, header)
                self.assertTrue((target / f"{self.picks.script[1]}.new").is_file())
                self.assertTrue((target / "CLAUDE.md").read_text(encoding="utf-8").startswith("@AGENTS.md\n"))
                saved = backups(target)
                self.assertEqual(saved["CLAUDE.md"], PRE_FILES["CLAUDE.md"].encode("utf-8"))
                self.assertEqual(saved["README.md"], PRE_FILES["README.md"].encode("utf-8"))
                self.assertEqual(saved[".agents/verify-checks.json"], PRE_FILES[".agents/verify-checks.json"].encode("utf-8"))
                self.assertNotIn(self.picks.script[1], saved)
        kinds = {m["path"]: m["kind"] for m in j["merged"]}
        for rel, kind in (("README.md", "lines"), (".agents/verify-checks.json", "keys"), ("CLAUDE.md", "kit"),
                          (self.picks.header_doc[1], "kit"), (self.picks.plain_doc[1], "lines"), (self.picks.changed[1], "kit")):
            self.assertEqual(kinds.get(rel), kind, rel)
        self.assertEqual(o.sh_run.stdout.count("v1 lock 첫 업데이트"), 1, o.sh_run.stdout[-3000:])
        # 두 번째 update: lock 이 표시 줄 있는 v1 · v2 라 병합하지 않는다.
        env = base_env({})
        sh2 = subprocess.run(["bash", str(self.new / "skills/hx-update/update.sh"), str(o.sh)], env=env, capture_output=True, text=True, timeout=300)
        cl2 = subprocess.run(["node", str(self.cli), "update", "--json", "--templates", str(kit_tpl), "--cwd", str(o.cli)],
                             env=env, capture_output=True, text=True, timeout=300)
        self.assertEqual(sh2.returncode, 0, sh2.stderr[-2000:])
        self.assertNotIn("v1 lock 첫 업데이트", sh2.stdout)
        self.assertEqual(json.loads(cl2.stdout)["merged"], [])


if __name__ == "__main__":
    unittest.main()
