"""setup.sh ↔ CLI 동일성 시험(HK-8 R2.1 · R4.2 · R1.2, 설계 02 §3.15).

    python3 -m unittest tests.test_cli_parity

조합마다 같은 이름의 빈 폴더 두 개에 setup.sh 와 `node <cli> init --yes` 를 같은 환경 토큰으로 돌리고
파일 목록 · 폴더 목록 · 바이트 · 권한 비트를 비교한다. lock · 메타는 의미로 비교한다.
네트워크를 쓰지 않는다. Node 18 이상이 필요하다(킷 개발 환경).
"""

from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cli_dist  # noqa: E402

KIT = cli_dist.KIT
SETUP = KIT / "plugins/harness-kit/skills/hx-bootstrap/setup.sh"
TEMPLATES = cli_dist.PLUGIN_TEMPLATES
STATE = (".agents/harness-kit.lock", ".agents/harness-kit.json")
TOKEN_VARS = ("PROJECT_NAME", "PROJECT_SLUG", "PACKAGE_NS", "SERVICE_NAME", "PRIMARY_LANGUAGE", "BUILD_TOOL", "TEST_CMD", "DOMAIN_EXAMPLE", "PROTECTED_PATH")
SELECTION_VARS = ("STACK", "ARCH", "DOMAIN", "JVM_LANG", "HARNESS_AGENTS", "HARNESS_MODULES", "HARNESS_KIT_TEMPLATES")
DEFAULT_TOKENS = {"PROJECT_NAME": "Acme Notes", "PROJECT_SLUG": "acme-notes", "PACKAGE_NS": "com.acme.notes", "SERVICE_NAME": "notes-api"}


@dataclass(frozen=True)
class Case:
    name: str
    stack: str
    arch: str | None = None
    agents: str = "all"
    modules: str = "none"
    lang: str | None = None
    domain: str | None = None
    tokens: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_TOKENS))
    folder: str = "acme-notes"
    pre: dict[str, str] = field(default_factory=dict)


CASES = (
    Case("01-jvm", "jvm"),
    Case("02-python", "python"),
    Case("03-go", "go"),
    Case("04-web", "web"),
    Case("05-electron", "electron"),
    Case("06-jvm-lmm-kotlin-jira", "jvm", "layered-multimodule", modules="jira-workflow", lang="kotlin"),
    Case("07-jvm-standalone-guards", "jvm", "hexagonal-standalone", agents="claude,codex", modules="platform-guards"),
    Case("08-python-django-kiro", "python", "django", agents="claude,kiro", modules="multi-harness"),
    Case("09-go-feature-cursor", "go", "feature", agents="cursor"),
    Case("10-web-fsd-two-modules", "web", "feature-sliced", agents="claude", modules="platform-guards,jira-workflow"),
    Case("11-electron-monorepo-kiro", "electron", "monorepo", agents="kiro"),
    Case("12-jvm-modulith-existing", "jvm", "modulith", pre={"AGENTS.md": "# 손으로 쓴 AGENTS\n", ".claude/settings.json": "{\"mine\": true}\n"}),
    Case("13-python-modular-all-modules", "python", "modular", modules="all"),
    Case("14-jvm-claude-only", "jvm", "hexagonal", agents="claude"),
    Case("15-go-flat-frontend-domain", "go", "flat", agents="codex", domain="frontend"),
    Case("16-web-spa-default-slug", "web", "react-spa", agents="claude", tokens={}, folder="spa-app"),
    Case("17-jvm-nested", "jvm", "hexagonal-nested"),
    Case("18-jvm-layered-java", "jvm", "layered", lang="java"),
    Case("19-jvm-feature", "jvm", "feature"),
    Case("20-jvm-multimodule", "jvm", "multimodule"),
    Case("21-python-layered", "python", "layered"),
    Case("22-python-ai-service", "python", "ai-service"),
    Case("23-go-layered", "go", "layered"),
    Case("24-electron-feature", "electron", "feature"),
)


def base_env(tokens: dict[str, str]) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k not in TOKEN_VARS + SELECTION_VARS}
    return {**env, **tokens}


def setup_args(c: Case, target: Path) -> list[str]:
    args = ["bash", str(SETUP), f"--stack={c.stack}", f"--agents={c.agents}", f"--modules={c.modules}"]
    if c.arch:
        args.append(f"--arch={c.arch}")
    if c.lang:
        args.append(f"--lang={c.lang}")
    if c.domain:
        args.append(f"--domain={c.domain}")
    return [*args, str(target)]


def cli_args(cli: Path, c: Case, target: Path) -> list[str]:
    args = ["node", str(cli), "init", "--yes", "--templates", str(TEMPLATES), "--cwd", str(target),
            "--stack", c.stack, "--agents", c.agents, "--modules", c.modules]
    if c.arch:
        args += ["--arch", c.arch]
    if c.lang:
        args += ["--lang", c.lang]
    if c.domain:
        args += ["--domain", c.domain]
    return args


def snapshot(root: Path) -> tuple[dict[str, tuple[str, bytes, int]], set[str]]:
    files: dict[str, tuple[str, bytes, int]] = {}
    dirs: set[str] = set()
    for dirpath, dirnames, filenames in os.walk(root):
        base = Path(dirpath)
        for d in dirnames:
            p = base / d
            rel = p.relative_to(root).as_posix()
            if p.is_symlink():
                files[rel] = ("link", os.readlink(p).encode(), 0)
            else:
                dirs.add(rel)
        for f in filenames:
            p = base / f
            rel = p.relative_to(root).as_posix()
            if rel in STATE:
                continue
            st = p.lstat()
            if stat.S_ISLNK(st.st_mode):
                files[rel] = ("link", os.readlink(p).encode(), 0)
            else:
                files[rel] = ("file", p.read_bytes(), stat.S_IMODE(st.st_mode))
    return files, dirs


def meta_fields(path: Path) -> dict:
    m = json.loads(path.read_text(encoding="utf-8"))
    return {k: m.get(k) for k in ("stack", "arch", "domain", "agents", "modules", "tokens")}


def lock_hashes(path: Path) -> dict[str, str | None]:
    text = path.read_text(encoding="utf-8")
    out: dict[str, str | None] = {}
    if text.startswith("# harness-kit lock v1"):
        for line in text.splitlines():
            if not line or line.startswith("#"):
                continue
            sha, _layer, _agent, rel = line.split("\t")
            out.setdefault(rel, sha)
        return out
    lock = json.loads(text)
    assert lock["schema"] == "harness-kit.lock/v2", lock.get("schema")
    for e in lock["entries"]:
        out[e["path"]] = e.get("sha256") if e["owner"] == "kit" else None
    return out


@dataclass
class Outcome:
    case: Case
    sh: Path
    cli: Path
    sh_run: subprocess.CompletedProcess
    cli_run: subprocess.CompletedProcess


def install_pair(cli: Path, root: Path, c: Case) -> Outcome:
    sh = root / c.name / "sh" / c.folder
    cl = root / c.name / "cli" / c.folder
    for target in (sh, cl):
        target.mkdir(parents=True)
        for rel, body in c.pre.items():
            p = target / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(body, encoding="utf-8")
    env = base_env(c.tokens)
    sh_run = subprocess.run(setup_args(c, sh), env=env, capture_output=True, text=True, timeout=300)
    cli_run = subprocess.run(cli_args(cli, c, cl), env=env, capture_output=True, text=True, timeout=300)
    return Outcome(c, sh, cl, sh_run, cli_run)


def doctor(cli: Path, target: Path) -> subprocess.CompletedProcess:
    return subprocess.run(["node", str(cli), "doctor", "--check", "--json", "--cwd", str(target)],
                          capture_output=True, text=True, timeout=120)


@unittest.skipUnless(shutil.which("node"), "Node 18 이상이 필요하다")
class CliParityTest(unittest.TestCase):
    outcomes: list[Outcome] = []

    @classmethod
    def setUpClass(cls):
        cls.cli = cli_dist.cli_bundle()
        cls.tmp = Path(tempfile.mkdtemp(prefix="hk-parity-")).resolve()
        with ThreadPoolExecutor(max_workers=4) as pool:
            cls.outcomes = list(pool.map(lambda c: install_pair(cls.cli, cls.tmp, c), CASES))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_matrix_covers_every_stack_and_arch(self):
        stacks = {p.name for p in (TEMPLATES / "stacks").iterdir() if p.is_dir()}
        archs = {(s, a.name) for s in stacks for a in (TEMPLATES / "stacks" / s / "arch").iterdir() if a.is_dir()}
        covered = set()
        for c in CASES:
            arch = c.arch or {"web": "nextjs-app", "electron": "main-renderer"}.get(c.stack, "hexagonal")
            covered.add((c.stack, arch))
        self.assertEqual(archs - covered, set())
        self.assertEqual({c.stack for c in CASES}, stacks)

    def test_same_files_bytes_and_modes(self):
        for o in self.outcomes:
            with self.subTest(case=o.case.name):
                self.assertEqual(o.sh_run.returncode, 0, o.sh_run.stderr[-2000:])
                self.assertEqual(o.cli_run.returncode, 0, o.cli_run.stdout[-2000:] + o.cli_run.stderr[-2000:])
                sh_files, sh_dirs = snapshot(o.sh)
                cl_files, cl_dirs = snapshot(o.cli)
                self.assertEqual(sorted(set(sh_files) - set(cl_files)), [], "setup.sh 에만 있는 파일")
                self.assertEqual(sorted(set(cl_files) - set(sh_files)), [], "CLI 에만 있는 파일")
                self.assertEqual(sorted(sh_dirs ^ cl_dirs), [], "폴더 목록")
                diff_bytes = sorted(r for r in sh_files if sh_files[r][1] != cl_files[r][1])
                diff_modes = sorted(f"{r} {oct(sh_files[r][2])}≠{oct(cl_files[r][2])}" for r in sh_files if sh_files[r][2] != cl_files[r][2])
                self.assertEqual(diff_bytes, [], "내용")
                self.assertEqual(diff_modes, [], "권한 비트")
                self.assertGreater(len(sh_files), 100)

    def test_meta_and_lock_mean_the_same(self):
        for o in self.outcomes:
            with self.subTest(case=o.case.name):
                if o.sh_run.returncode or o.cli_run.returncode:
                    self.fail("설치 실패(test_same_files_bytes_and_modes 참고)")
                self.assertEqual(meta_fields(o.sh / STATE[1]), meta_fields(o.cli / STATE[1]))
                cli_meta = json.loads((o.cli / STATE[1]).read_text(encoding="utf-8"))
                self.assertEqual(cli_meta["schema"], "harness-kit/v2")
                self.assertTrue(cli_meta["verify"]["fullOnlyInCI"])
                sh_lock = lock_hashes(o.sh / STATE[0])
                cl_lock = lock_hashes(o.cli / STATE[0])
                self.assertEqual(sorted(sh_lock), sorted(cl_lock), "lock 경로 집합")
                for rel, sha in cl_lock.items():
                    if sha is not None:
                        self.assertEqual(sha, sh_lock[rel], rel)
                user = sorted(r for r, sha in cl_lock.items() if sha is None)
                self.assertEqual(user, sorted(o.case.pre), "사람 파일(owner user)")

    def test_doctor_passes_on_both_installs(self):
        for o in self.outcomes:
            with self.subTest(case=o.case.name):
                for target in (o.cli, o.sh):
                    r = doctor(self.cli, target)
                    self.assertEqual(r.returncode, 0, r.stdout[-2000:] + r.stderr[-2000:])
                    summary = json.loads(r.stdout)["summary"]
                    self.assertEqual((summary["errors"], summary["missing"]), (0, 0), target)


@unittest.skipUnless(shutil.which("node"), "Node 18 이상이 필요하다")
class CliBundleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cli = cli_dist.cli_bundle()

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="hk-bundle-")).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_package_has_no_runtime_dependencies(self):
        pkg = json.loads((cli_dist.CLI_DIR / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(pkg["dependencies"], {})
        self.assertEqual(pkg["engines"]["node"], ">=18.3")  # util.parseArgs 가 18.3 부터 있다
        self.assertEqual(pkg["bin"], {"harness-kit": "dist/cli.js"})
        self.assertEqual(pkg["name"], "harness-kit")

    def test_bundle_requires_only_node_builtins(self):
        import re

        text = self.cli.read_text(encoding="utf-8")
        mods = set(re.findall(r"require\(\"([^\"]+)\"\)", text))
        self.assertTrue(mods, "require 가 하나도 없다")
        self.assertEqual(sorted(m for m in mods if not m.startswith("node:")), [])
        self.assertTrue(text.startswith("#!/usr/bin/env node\n"))
        self.assertTrue(os.access(self.cli, os.X_OK))

    def test_runs_alone_without_node_modules(self):
        lone = self.tmp / "bin" / "harness-kit.js"
        lone.parent.mkdir()
        shutil.copy2(self.cli, lone)
        version = json.loads((cli_dist.CLI_DIR / "package.json").read_text(encoding="utf-8"))["version"]
        r = subprocess.run(["node", str(lone), "--version"], cwd=self.tmp, capture_output=True, text=True, timeout=60)
        self.assertEqual((r.returncode, r.stdout), (0, f"{version}\n"), r.stderr)
        missing = subprocess.run(["node", str(lone), "plan", "--cwd", str(self.tmp / "x")], cwd=self.tmp,
                                 capture_output=True, text=True, timeout=60, env=base_env({}))
        self.assertEqual(missing.returncode, 5, missing.stdout + missing.stderr)
        plan = subprocess.run(["node", str(lone), "plan", "--json", "--templates", str(TEMPLATES), "--cwd", str(self.tmp / "x"), "--agents", "claude"],
                              cwd=self.tmp, capture_output=True, text=True, timeout=60, env=base_env({}))
        self.assertEqual(plan.returncode, 0, plan.stdout + plan.stderr)
        self.assertGreater(json.loads(plan.stdout)["counts"]["create"], 100)

    def test_finds_templates_next_to_bundle(self):
        r = subprocess.run(["node", str(self.cli), "plan", "--json", "--quiet", "--cwd", str(self.tmp / "x"), "--agents", "claude"],
                           capture_output=True, text=True, timeout=60, env=base_env({}))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        want = KIT / "packages/templates" if self.cli == cli_dist.DIST else TEMPLATES
        self.assertEqual(Path(json.loads(r.stdout)["templates"]).resolve(), want.resolve())

    def test_node_older_than_18_3_exits_5(self):
        """Node 16 · 18.2 로 꾸미면 다른 일을 하기 전에 exit 5 와 필요한 버전을 낸다(R1.1)."""
        for fake in ("16.20.2", "18.2.1"):
            with self.subTest(node=fake):
                script = (f"Object.defineProperty(process.versions,'node',{{value:{json.dumps(fake)}}});"
                          f"process.argv=[process.argv[0],{json.dumps(str(self.cli))},'init','--yes'];"
                          f"require({json.dumps(str(self.cli))});")
                r = subprocess.run(["node", "-e", script], cwd=self.tmp, capture_output=True, text=True, timeout=60)
                self.assertEqual(r.returncode, 5, r.stdout + r.stderr)
                self.assertIn("Node 18.3", r.stdout + r.stderr)
                self.assertEqual(list(self.tmp.iterdir()), [])

if __name__ == "__main__":
    unittest.main()
