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
# sed 가 다르게 읽는 문자(& · | · \)가 든 치환값(HK-10 R10.2).
SPECIAL_TOKENS = {**DEFAULT_TOKENS, "PROJECT_NAME": "A&B | C\\D", "SERVICE_NAME": "notes&api|v2\\x"}
# platform-guards 모듈이 common 과 같은 경로에 까는 파일(설치 경로 → 모듈 템플릿 경로).
GUARD_OVERLAPS = {
    ".agents/rules/platform-invariants.md": "optional/platform-guards/agents-rules/platform-invariants.md",
    ".kiro/steering/platform-invariants.md": "optional/platform-guards/kiro-steering/platform-invariants.md",
    "scripts/run-guards.sh": "optional/platform-guards/scripts/run-guards.sh",
    "scripts/guards/_template.sh": "optional/platform-guards/scripts/guards/_template.sh",
}
LATER_MARK = {"md": "\n<!-- 뒤 레이어 판(HK-10) -->\n", "sh": "\n# 뒤 레이어 판(HK-10)\n"}
# 겹침 경로마다 모듈 판에만 표시 줄을 붙인 템플릿 사본 — 뒤 레이어가 이기면 두 설치 모두 표시 줄이 있다(HK-10 R10.1).
LATER_PATCH = {src: LATER_MARK[src.rsplit(".", 1)[1]] for src in GUARD_OVERLAPS.values()}


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
    # 템플릿 사본에 덧붙일 줄(템플릿 상대 경로 → 내용). 있으면 플러그인 사본으로 두 설치를 한다.
    patch: dict[str, str] = field(default_factory=dict)


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
    Case("25-python-layered-guards-later-wins", "python", "layered", modules="platform-guards", patch=LATER_PATCH),
    Case("26-go-special-tokens", "go", "hexagonal", agents="claude", tokens=SPECIAL_TOKENS),
)


def base_env(tokens: dict[str, str]) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k not in TOKEN_VARS + SELECTION_VARS}
    return {**env, **tokens}


def setup_args(c: Case, target: Path, setup: Path = SETUP) -> list[str]:
    args = ["bash", str(setup), f"--stack={c.stack}", f"--agents={c.agents}", f"--modules={c.modules}"]
    if c.arch:
        args.append(f"--arch={c.arch}")
    if c.lang:
        args.append(f"--lang={c.lang}")
    if c.domain:
        args.append(f"--domain={c.domain}")
    return [*args, str(target)]


def cli_args(cli: Path, c: Case, target: Path, templates: Path = TEMPLATES) -> list[str]:
    args = ["node", str(cli), "init", "--yes", "--templates", str(templates), "--cwd", str(target),
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


def lock_owners(path: Path) -> dict[str, tuple[str, str]]:
    """lock 의 경로 → (op, 사람 파일이면 'user' 아니면 'kit'). v1 은 해시 '-' 인 copy · mirror · render 를 사람 몫으로 본다(merge 는 해시가 없다)."""
    text = path.read_text(encoding="utf-8")
    out: dict[str, tuple[str, str]] = {}
    if text.startswith("# harness-kit lock v1"):
        for line in text.splitlines():
            if not line or line.startswith("#"):
                continue
            sha, layer, _agent, rel = line.split("\t")
            op = layer.rstrip("+") if layer.rstrip("+") in ("mirror", "render", "merge") else "copy"
            out.setdefault(rel, (op, "user" if sha == "-" and op != "merge" else "kit"))
        return out
    for e in json.loads(text)["entries"]:
        out[e["path"]] = (e["op"], "user" if e["owner"] == "user" else "kit")
    return out


def lock_layers(path: Path) -> dict[str, list[str]]:
    """lock 의 경로 → 레이어 줄 목록(v1 은 같은 경로가 여러 줄일 수 있다)."""
    text = path.read_text(encoding="utf-8")
    out: dict[str, list[str]] = {}
    if text.startswith("# harness-kit lock v1"):
        for line in text.splitlines():
            if line and not line.startswith("#"):
                _sha, layer, _agent, rel = line.split("\t")
                out.setdefault(rel, []).append(layer)
        return out
    for e in json.loads(text)["entries"]:
        out.setdefault(e["path"], []).append(e["layer"])
    return out


@dataclass
class Outcome:
    case: Case
    sh: Path
    cli: Path
    sh_run: subprocess.CompletedProcess
    cli_run: subprocess.CompletedProcess


def kit_for(root: Path, c: Case) -> tuple[Path, Path]:
    """조합이 쓸 setup.sh 와 템플릿. patch 가 있으면 플러그인 사본에 줄을 덧붙여 두 설치가 같은 사본을 쓴다."""
    if not c.patch:
        return SETUP, TEMPLATES
    kit = root / c.name / "kit"
    shutil.copytree(KIT / "plugins/harness-kit", kit, symlinks=True)
    templates = kit / "skills/hx-bootstrap/templates"
    for rel, extra in c.patch.items():
        with (templates / rel).open("a", encoding="utf-8") as handle:
            handle.write(extra)
    return kit / "skills/hx-bootstrap/setup.sh", templates


def install_pair(cli: Path, root: Path, c: Case) -> Outcome:
    sh = root / c.name / "sh" / c.folder
    cl = root / c.name / "cli" / c.folder
    for target in (sh, cl):
        target.mkdir(parents=True)
        for rel, body in c.pre.items():
            p = target / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(body, encoding="utf-8")
    setup, templates = kit_for(root, c)
    env = base_env(c.tokens)
    sh_run = subprocess.run(setup_args(c, sh, setup), env=env, capture_output=True, text=True, timeout=300)
    cli_run = subprocess.run(cli_args(cli, c, cl, templates), env=env, capture_output=True, text=True, timeout=300)
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
                owners = lock_owners(o.cli / STATE[0])
                self.assertEqual(owners, lock_owners(o.sh / STATE[0]), "lock 경로별 op · 주인")
                user = sorted(r for r, (_op, owner) in owners.items() if owner == "user")
                # 미리 있던 .claude/settings.json 은 병합 대상이라 킷 키만 더한다(HK-13). 나머지 미리 있던 파일은 사람 몫이다.
                pre_user = sorted(r for r in o.case.pre if owners.get(r, ("copy", ""))[0] != "merge")
                self.assertEqual(user, pre_user, "사람 파일(owner user)")
                # 설치 전부터 있던 파일은 setup.sh 도 '-' 로 적어 update 가 덮지 않는다. 표시 줄이 그 약속이다(HK-12 R12.6).
                self.assertEqual({r: sh_lock[r] for r in o.case.pre}, {r: "-" for r in o.case.pre})
                self.assertEqual((o.sh / STATE[0]).read_text(encoding="utf-8").splitlines()[1], "# pre-existing: -")

    def outcome(self, name: str) -> Outcome:
        found = next(o for o in self.outcomes if o.case.name == name)
        if found.sh_run.returncode or found.cli_run.returncode:
            self.fail(f"{name} 설치 실패(test_same_files_bytes_and_modes 참고): {found.sh_run.stderr[-1000:]}")
        return found

    def test_overlap_later_layer_wins(self):
        """같은 설치 경로가 common 과 모듈에 있으면 두 설치 모두 모듈(뒤 레이어) 판을 쓰고 lock 에 한 줄만 남긴다(HK-10 R10.1)."""
        patched = self.outcome("25-python-layered-guards-later-wins")
        for rel, src in GUARD_OVERLAPS.items():
            for target in (patched.sh, patched.cli):
                with self.subTest(path=rel, target=target.parent.name):
                    self.assertTrue((target / rel).read_text(encoding="utf-8").endswith(LATER_PATCH[src]))
        for name in ("07-jvm-standalone-guards", "10-web-fsd-two-modules", "13-python-modular-all-modules", "25-python-layered-guards-later-wins"):
            o = self.outcome(name)
            sh_layers, cl_layers = lock_layers(o.sh / STATE[0]), lock_layers(o.cli / STATE[0])
            for rel in (r for r in GUARD_OVERLAPS if (o.sh / r).is_file()):
                with self.subTest(case=name, path=rel):
                    self.assertEqual(sh_layers[rel], ["mod/platform-guards"])
                    self.assertEqual(cl_layers[rel], ["optional/platform-guards"])

    def test_special_tokens_are_literal(self):
        """& · | · \\ 가 든 치환값이 두 설치에 글자 그대로 들어간다(HK-10 R10.2)."""
        o = self.outcome("26-go-special-tokens")
        name, service = SPECIAL_TOKENS["PROJECT_NAME"], SPECIAL_TOKENS["SERVICE_NAME"]
        for target in (o.sh, o.cli):
            with self.subTest(target=target.parent.name):
                agents = (target / "AGENTS.md").read_text(encoding="utf-8")
                self.assertIn(name, agents)
                self.assertNotIn("{{PROJECT_NAME}}", agents)
                self.assertIn(service, (target / "ARCHITECTURE.md").read_text(encoding="utf-8"))
                manifest = json.loads((target / ".agents/harness.json").read_text(encoding="utf-8"))
                self.assertEqual(manifest["title"], name)

    def test_templates_have_no_nul_or_soh_bytes(self):
        """setup.sh 의 awk 치환은 파일 하나를 \\001 로 나눈 레코드로 읽고, CLI 는 NUL 이 든 파일을 치환하지 않는다."""
        found = sorted(p.relative_to(TEMPLATES).as_posix() for p in TEMPLATES.rglob("*") if p.is_file() and (b"\0" in p.read_bytes() or b"\x01" in p.read_bytes()))
        self.assertEqual(found, [])

    def test_projection_copies_instead_of_pointers(self):
        """하네스 폴더는 원본의 복사본 · 생성물이다. 링크 · v1 포인터 0개, 미리 있던 settings.json 은 사람 키를 둔 채 병합된다(HK-13 R1 · R4)."""
        for o in self.outcomes:
            with self.subTest(case=o.case.name):
                if o.sh_run.returncode or o.cli_run.returncode:
                    self.fail("설치 실패(test_same_files_bytes_and_modes 참고)")
                files, _ = snapshot(o.sh)
                self.assertEqual([r for r, f in files.items() if f[0] == "link"], [])
                self.assertEqual([r for r in files if r.startswith(".claude/commands/")], [])
                agents = {"all": {"claude", "codex", "cursor", "kiro"}}.get(o.case.agents, set(o.case.agents.split(",")))
                for skill in sorted(p.name for p in (o.sh / ".agents/skills").iterdir()):
                    src = (o.sh / ".agents/skills" / skill / "SKILL.md").read_bytes()
                    if "claude" in agents:
                        self.assertEqual((o.sh / ".claude/skills" / skill / "SKILL.md").read_bytes(), src, skill)
                    if "kiro" in agents:
                        self.assertEqual((o.sh / ".kiro/skills" / skill / "SKILL.md").read_bytes(), src, skill)
                    if "cursor" in agents:
                        self.assertIn(src.split(b"\n---\n", 1)[1], (o.sh / ".cursor/commands" / f"{skill}.md").read_bytes())
                if "claude" in agents:
                    self.assertTrue((o.sh / "CLAUDE.md").read_text(encoding="utf-8").startswith("@AGENTS.md\n") or o.case.pre.get("CLAUDE.md"))
        settings = json.loads((self.outcome("12-jvm-modulith-existing").sh / ".claude/settings.json").read_text(encoding="utf-8"))
        self.assertTrue(settings["mine"])
        self.assertIn("Stop", settings["hooks"])

    def test_doctor_passes_on_both_installs(self):
        for o in self.outcomes:
            with self.subTest(case=o.case.name):
                for target in (o.cli, o.sh):
                    r = doctor(self.cli, target)
                    self.assertEqual(r.returncode, 0, r.stdout[-2000:] + r.stderr[-2000:])
                    report = json.loads(r.stdout)
                    summary = report["summary"]
                    self.assertEqual((summary["errors"], summary["missing"]), (0, 0), target)
                    # 설치되는 .gitignore 가 .agents/state · local · reports 를 넣는다(HK-9 R9.4).
                    self.assertEqual([f for f in report["findings"] if f["kind"] == "gitignore"], [], target)


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
