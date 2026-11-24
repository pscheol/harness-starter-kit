"""add-agent.sh ↔ CLI add, setup.sh 새 설치 ↔ CLI remove 동일성 시험(HK-12 R12.1 · R12.2, design §11.3).

    python3 -m unittest tests.test_cli_addremove_parity

add: setup.sh 로 일부 하네스 · 모듈만 깔고 두 벌로 복사한다. 한 벌에 add-agent.sh, 다른 벌에 `node <cli> add`.
remove: v1 에는 빼는 스크립트가 없다. setup.sh 로 크게 깐 리포에 CLI `remove` 를 돌린 결과를 같은 선택값의
setup.sh 새 설치와 비교한다. 파일 목록 · 바이트 · 권한 · 폴더를 비교하고 lock · 메타 · .agents/state/ 는 의미로 본다.
네트워크를 쓰지 않는다.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cli_dist  # noqa: E402
from test_cli_parity import DEFAULT_TOKENS, base_env, lock_hashes  # noqa: E402
from test_cli_update_parity import LOCK, META, snapshot  # noqa: E402

KIT = cli_dist.KIT
PLUGIN = KIT / "plugins/kns"
SETUP = PLUGIN / "skills/bootstrap/setup.sh"
ADD_AGENT = PLUGIN / "skills/agent-add/add-agent.sh"
TEMPLATES = cli_dist.PLUGIN_TEMPLATES
HARNESSES = ("claude", "codex", "cursor", "kiro")


@dataclass(frozen=True)
class Case:
    name: str
    stack: str
    arch: str
    agents: str
    modules: str
    names: tuple[str, ...]
    # 처음 설치 뒤 두 벌에 똑같이 둘 사람 파일(add) · 덧붙일 줄(remove)
    pre: dict[str, str] = field(default_factory=dict)
    edit: dict[str, str] = field(default_factory=dict)


ADD_CASES = (
    Case("A1-jvm-add-codex", "jvm", "hexagonal", "claude", "none", ("codex",)),
    Case("A2-python-add-cursor-jira", "python", "layered", "claude,kiro", "none", ("cursor", "jira-workflow"),
         pre={".cursor/commands/kns-specify.md": "사람이 먼저 둔 커맨드\n"}),
    Case("A3-web-add-guards-claude", "web", "nextjs-app", "codex", "none", ("platform-guards", "claude")),
    Case("A4-go-add-kiro-multi", "go", "hexagonal", "claude", "jira-workflow", ("kiro", "multi-harness")),
)
REMOVE_CASES = (
    # names 를 뺀 선택값(agents · modules 의 남는 것)으로 새로 깐 리포와 비교한다.
    Case("R1-electron-remove-codex-guards", "electron", "main-renderer", "claude,codex,kiro", "jira-workflow,platform-guards", ("codex", "platform-guards")),
    Case("R2-python-remove-cursor-edited", "python", "hexagonal", "claude,cursor", "none", ("cursor",),
         edit={".cursor/commands/kns-specify.md": "사람이 더한 줄\n"}),
)


def all_ops(j: dict) -> list[dict]:
    """복사 판정 + 배치 판정(HK-13 — 하네스 폴더 파일은 대부분 배치 쪽에 있다)."""
    return [*j["ops"], *(j.get("projection") or {}).get("ops", [])]


def setup(target: Path, stack: str, arch: str, agents: str, modules: str) -> None:
    target.mkdir(parents=True)
    r = subprocess.run(["bash", str(SETUP), f"--stack={stack}", f"--arch={arch}", f"--agents={agents}", f"--modules={modules}", str(target)],
                       env=base_env(DEFAULT_TOKENS), capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(f"setup.sh 실패 {target}: {r.stderr[-2000:]}")


def remaining(listed: str, names: tuple[str, ...]) -> str:
    left = [x for x in listed.split(",") if x and x != "none" and x not in names]
    return ",".join(left) or "none"


@dataclass
class Outcome:
    case: Case
    base: Path
    sh: Path
    cli: Path
    sh_run: subprocess.CompletedProcess | None
    cli_run: subprocess.CompletedProcess


def run_add(cli: Path, root: Path, c: Case) -> Outcome:
    work = root / c.name
    base = work / "base" / "acme-notes"
    setup(base, c.stack, c.arch, c.agents, c.modules)
    for rel, body in c.pre.items():
        (base / rel).parent.mkdir(parents=True, exist_ok=True)
        (base / rel).write_text(body, encoding="utf-8")
    sh, cl = work / "sh" / "acme-notes", work / "cli" / "acme-notes"
    for target in (sh, cl):
        shutil.copytree(base, target, symlinks=True)
    harnesses = [n for n in c.names if n in HARNESSES]
    modules = [n for n in c.names if n not in HARNESSES]
    args = ["bash", str(ADD_AGENT)]
    if harnesses:
        args.append(f"--agents={','.join(harnesses)}")
    if modules:
        args.append(f"--modules={','.join(modules)}")
    env = base_env({})
    sh_run = subprocess.run([*args, str(sh)], env=env, capture_output=True, text=True, timeout=300)
    cli_run = subprocess.run(["node", str(cli), "add", *c.names, "--json", "--templates", str(TEMPLATES), "--cwd", str(cl)],
                             env=env, capture_output=True, text=True, timeout=300)
    return Outcome(c, base, sh, cl, sh_run, cli_run)


def run_remove(cli: Path, root: Path, c: Case) -> Outcome:
    work = root / c.name
    base = work / "base" / "acme-notes"
    setup(base, c.stack, c.arch, c.agents, c.modules)
    cl = work / "cli" / "acme-notes"
    shutil.copytree(base, cl, symlinks=True)
    for rel, line in c.edit.items():
        with (cl / rel).open("a", encoding="utf-8") as f:
            f.write(line)
    fresh = work / "fresh" / "acme-notes"
    setup(fresh, c.stack, c.arch, remaining(c.agents, c.names), remaining(c.modules, c.names))
    cli_run = subprocess.run(["node", str(cli), "remove", *c.names, "--json", "--templates", str(TEMPLATES), "--cwd", str(cl)],
                             env=base_env({}), capture_output=True, text=True, timeout=300)
    return Outcome(c, base, fresh, cl, None, cli_run)


@unittest.skipUnless(shutil.which("node"), "Node 18.3 이상이 필요하다")
class CliAddRemoveParityTest(unittest.TestCase):
    outcomes: dict[str, Outcome] = {}

    @classmethod
    def setUpClass(cls):
        cls.cli = cli_dist.cli_bundle()
        cls.tmp = Path(tempfile.mkdtemp(prefix="hk-addremove-")).resolve()
        jobs = [(run_add, c) for c in ADD_CASES] + [(run_remove, c) for c in REMOVE_CASES]
        with ThreadPoolExecutor(max_workers=4) as pool:
            done = list(pool.map(lambda job: job[0](cls.cli, cls.tmp, job[1]), jobs))
        cls.outcomes = {o.case.name: o for o in done}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def ran(self, name: str, code: int = 0) -> tuple[Outcome, dict]:
        o = self.outcomes[name]
        if o.sh_run is not None:
            self.assertEqual(o.sh_run.returncode, 0, o.sh_run.stdout[-1500:] + o.sh_run.stderr[-1500:])
        self.assertEqual(o.cli_run.returncode, code, o.cli_run.stdout[-2000:] + o.cli_run.stderr[-1500:])
        self.assertEqual(o.cli_run.stderr, "")
        return o, json.loads(o.cli_run.stdout)

    def assert_same_tree(self, o: Outcome, *, extra_cli: set[str] = frozenset()) -> None:
        sh_files, sh_dirs = snapshot(o.sh)
        cl_files, cl_dirs = snapshot(o.cli)
        for rel in extra_cli:
            self.assertIn(rel, cl_files)
            del cl_files[rel]
            parts = rel.split("/")
            cl_dirs -= {"/".join(parts[:i]) for i in range(1, len(parts))} - sh_dirs  # 남긴 파일의 상위 폴더
        self.assertEqual(sorted(set(sh_files) - set(cl_files)), [], "v1 쪽에만 있는 파일")
        self.assertEqual(sorted(set(cl_files) - set(sh_files)), [], "CLI 에만 있는 파일")
        self.assertEqual(sorted(r for r in sh_files if sh_files[r][1] != cl_files[r][1]), [], "내용")
        modes = sorted(f"{r} {oct(sh_files[r][2])}≠{oct(cl_files[r][2])}" for r in sh_files if sh_files[r][2] != cl_files[r][2])
        self.assertEqual(modes, [], "권한 비트")
        self.assertEqual(sorted(sh_dirs ^ cl_dirs), [], "폴더 목록")
        self.assertGreater(len(sh_files), 100)

    def assert_lock_means_same(self, o: Outcome, *, user: set[str] = frozenset()) -> None:
        sh = lock_hashes(o.sh / LOCK)
        lock = json.loads((o.cli / LOCK).read_text(encoding="utf-8"))
        self.assertEqual(lock["schema"], "knots-sync.lock/v2")
        entries = {e["path"]: e for e in lock["entries"]}
        self.assertEqual(sorted(set(entries) - user), sorted(set(sh) - user), "lock 경로")
        for rel, e in entries.items():
            if rel in user:
                self.assertEqual((e["owner"], e.get("sha256")), ("user", None), rel)
                if rel in sh:
                    self.assertEqual(sh[rel], "-", rel)
            else:
                self.assertEqual(e["owner"], "kit", rel)
                self.assertEqual(e.get("sha256") or "-", sh[rel], rel)

    def assert_meta_means_same(self, o: Outcome) -> None:
        sh = json.loads((o.sh / META).read_text(encoding="utf-8"))
        cl = json.loads((o.cli / META).read_text(encoding="utf-8"))
        for k in ("stack", "arch", "domain", "agents", "modules", "tokens"):
            self.assertEqual(cl.get(k), sh.get(k), k)
        self.assertEqual(cl["schema"], "knots-sync/v2")

    def doctor_ok(self, target: Path) -> None:
        d = subprocess.run(["node", str(self.cli), "doctor", "--check", "--json", "--cwd", str(target)], capture_output=True, text=True, timeout=120)
        self.assertEqual(d.returncode, 0, d.stdout[-2000:])

    def test_a1_add_harness(self):
        o, j = self.ran("A1-jvm-add-codex")
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        self.assert_meta_means_same(o)
        self.assertEqual(j["names"]["harnesses"], ["codex"])
        self.assertGreater(len([op for op in all_ops(j) if op["action"] == "create"]), 5)
        self.doctor_ok(o.cli)

    def test_a2_add_harness_and_module_with_user_file(self):
        o, j = self.ran("A2-python-add-cursor-jira")
        mine = ".cursor/commands/kns-specify.md"
        self.assert_same_tree(o)
        self.assert_lock_means_same(o, user={mine})
        self.assert_meta_means_same(o)
        self.assertEqual((o.cli / mine).read_text(encoding="utf-8"), "사람이 먼저 둔 커맨드\n")
        self.assertEqual([op["action"] for op in all_ops(j) if op["path"] == mine], ["skip-user"])

    def test_a3_add_retired_module_is_notice_only(self):
        """없앤 모듈 platform-guards: add-agent.sh · CLI add 모두 한 줄 알리고 claude 만 켠다(HK-25 R2)."""
        o, j = self.ran("A3-web-add-guards-claude")
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        self.assert_meta_means_same(o)
        note = "platform-guards 모듈은 공통 층에 포함됨"
        self.assertEqual((o.sh_run.stdout + o.sh_run.stderr).count(note), 1, o.sh_run.stdout[-1500:])
        self.assertEqual(j["names"]["retired"], ["platform-guards"])
        lock = {e["path"]: e for e in json.loads((o.cli / LOCK).read_text(encoding="utf-8"))["entries"]}
        for rel in ("scripts/run-guards.sh", "scripts/guards/_template.sh", ".agents/rules/platform-invariants.md"):
            self.assertEqual(lock[rel]["layer"], "common", rel)
        for target in (o.sh, o.cli):
            self.assertEqual(json.loads((target / META).read_text(encoding="utf-8"))["modules"], [])

    def test_a4_add_kiro_brings_module_kiro_files(self):
        o, j = self.ran("A4-go-add-kiro-multi")
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        self.assert_meta_means_same(o)
        kiro = [op["path"] for op in all_ops(j) if op["path"].startswith(".kiro/") and op["action"] == "create"]
        self.assertTrue(any("issue" in p or "ticket" in p for p in kiro), kiro)

    def test_r1_remove_equals_fresh_install(self):
        o, j = self.ran("R1-electron-remove-codex-guards")
        self.assert_same_tree(o)
        self.assert_lock_means_same(o)
        self.assert_meta_means_same(o)
        self.assertEqual(j["names"]["retired"], ["platform-guards"])
        self.assertGreater(len([op for op in all_ops(j) if op["action"] == "delete"]), 5)
        self.assertFalse((o.cli / ".codex").exists())
        self.doctor_ok(o.cli)

    def test_r2_remove_keeps_edited_file(self):
        mine = ".cursor/commands/kns-specify.md"
        o, j = self.ran("R2-python-remove-cursor-edited", code=4)
        self.assert_same_tree(o, extra_cli={mine})
        self.assert_lock_means_same(o, user={mine})
        self.assertTrue((o.cli / mine).read_text(encoding="utf-8").endswith("사람이 더한 줄\n"))
        self.assertEqual(j["keep"], [mine])


if __name__ == "__main__":
    unittest.main()
