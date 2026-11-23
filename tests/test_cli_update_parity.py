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
SKIP = {LOCK, META}

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


@dataclass(frozen=True)
class Picks:
    """새 킷이 바꾸는 템플릿(템플릿 상대 경로, 설치 경로)."""

    changed: tuple[str, str]   # 킷이 바꾸는 규칙
    kept: tuple[str, str]      # 킷이 안 바꾸는 규칙
    script: tuple[str, str]    # 킷이 바꾸는 실행 파일
    removed: tuple[str, str]   # 킷에서 빼는 규칙
    deleted: tuple[str, str]   # 사람이 지우는 규칙(킷은 그대로)


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


# platform-guards: 이기는 판(모듈) · 지는 판(common)을 새 킷이 바꾼다(HK-12 R12.9 — HK-10 뒤 레이어 우선).
GUARD_WINNER = ("optional/platform-guards/scripts/run-guards.sh", "scripts/run-guards.sh")
GUARD_LOSER = ("common/agents-rules/platform-invariants.md", ".agents/rules/platform-invariants.md")
PRE_AGENTS = "# 손으로 쓴 AGENTS — 설치 전부터 있었다\n"
LOCK_MARK = "# pre-existing: -"


def make_new_kit(root: Path, old: Path, picks: Picks) -> Path:
    kit = root / "new"
    shutil.copytree(old, kit, symlinks=True)
    tpl = kit / "skills/hx-bootstrap/templates"
    for rel in (picks.changed[0], picks.script[0], GUARD_WINNER[0], GUARD_LOSER[0]):
        with (tpl / rel).open("a", encoding="utf-8") as f:
            f.write("\n<!-- HK-11 새 판 줄 -->\n" if rel.endswith(".md") else "\n# HK-11 새 판 줄\n")
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
    Case("07-guards-later-wins", "python", "layered", "claude,kiro", nothing, modules="platform-guards"),
    Case("08-board-rebuild", "go", "hexagonal", "codex", stale_board),
    Case("09-pre-existing-legacy-lock", "jvm", "hexagonal", "claude", legacy_lock, prep=pre_agents),
    Case("10-pre-existing-marked-lock", "jvm", "hexagonal", "claude", nothing, prep=pre_agents),
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

    def test_07_platform_guards_later_layer_wins(self):
        o, j = self.ran("07-guards-later-wins")
        self.assertEqual(o.cli_run.returncode, 0)
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        self.assertTrue((o.cli / GUARD_WINNER[1]).read_text(encoding="utf-8").endswith("# HK-11 새 판 줄\n"))
        self.assertFalse((o.cli / GUARD_LOSER[1]).read_text(encoding="utf-8").endswith("<!-- HK-11 새 판 줄 -->\n"))
        actions = {op["path"]: op["action"] for op in j["ops"]}
        self.assertEqual(actions.get(GUARD_WINNER[1]), "update")
        self.assertNotIn(GUARD_LOSER[1], actions)
        lock = {e["path"]: e for e in json.loads((o.cli / LOCK).read_text(encoding="utf-8"))["entries"]}
        for rel in (GUARD_WINNER[1], GUARD_LOSER[1]):
            self.assertEqual(lock[rel]["layer"], "optional/platform-guards", rel)
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

    def test_09_pre_existing_file_with_legacy_lock_gets_new(self):
        o, j = self.ran("09-pre-existing-legacy-lock")
        self.assertEqual(o.cli_run.returncode, 4)
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        for target in (o.sh, o.cli):
            self.assertEqual((target / "AGENTS.md").read_text(encoding="utf-8"), PRE_AGENTS, target)
            self.assertTrue((target / "AGENTS.md.new").is_file(), target)
            self.assertTrue((target / f"{self.picks.changed[1]}.new").is_file(), target)
        sh_lock = lock_hashes(o.sh / LOCK)
        self.assertEqual((sh_lock["AGENTS.md"], sh_lock[self.picks.changed[1]]), ("-", "-"))
        self.assertTrue((o.sh / LOCK).read_text(encoding="utf-8").splitlines()[1] == LOCK_MARK)
        self.assertIn("AGENTS.md", [c["path"] for c in j["conflicts"]])

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


if __name__ == "__main__":
    unittest.main()
