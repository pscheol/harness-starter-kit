"""CLI 번들(packages/cli/dist/cli.js)을 시험에 쓰기 위한 도우미(HK-8 design §2.2 · §2.4).

번들 머리줄의 src-sha256 이 지금 소스 해시와 같은지로 "지금 소스에서 만든 번들"인지 본다.
식은 packages/cli/scripts/src-hash.mjs 와 같다.
"""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

# CLI init 은 이 컴퓨터 등록부(~/.config/harness-kit/projects.json)에 리포를 더한다(06 §3.17).
# 시험은 실제 홈을 쓰지 않는다 — 이 도우미를 부르는 시험과 그 하위 프로세스는 임시 설정 폴더를 쓴다.
os.environ.setdefault("HARNESS_KIT_CONFIG_DIR", tempfile.mkdtemp(prefix="hk-config-"))

KIT = Path(__file__).resolve().parents[1]
CLI_DIR = KIT / "packages/cli"
DIST = CLI_DIR / "dist/cli.js"
CLI_BIN_REL = "skills/hx-bootstrap/bin/harness-kit.js"
PLUGIN_BIN = KIT / "plugins/harness-kit" / CLI_BIN_REL
PLUGIN_TEMPLATES = KIT / "plugins/harness-kit/skills/hx-bootstrap/templates"
ROOT_FILES = ("build.mjs", "package.json", "tsconfig.json")
DIRS = ("scripts", "src")
BANNER_RE = re.compile(r"^// harness-kit \S+ · src-sha256 ([0-9a-f]{64})", re.M)


DASHBOARD_FILES = ("package.json",)
DASHBOARD_DIRS = ("scripts", "src", "static")


def source_files(cli_dir: Path = CLI_DIR) -> list[str]:
    """packages/cli 와 같은 번들에 묶이는 packages/dashboard(HK-17)의 소스. 경로는 packages/cli 기준(../dashboard/…)."""
    files = [f for f in ROOT_FILES if (cli_dir / f).is_file()]
    for d in DIRS:
        base = cli_dir / d
        if base.is_dir():
            files += [p.relative_to(cli_dir).as_posix() for p in base.rglob("*") if p.is_file() and not p.is_symlink() and p.name != ".DS_Store"]
    dash = cli_dir.parent / "dashboard"
    files += [f"../dashboard/{f}" for f in DASHBOARD_FILES if (dash / f).is_file()]
    for d in DASHBOARD_DIRS:
        base = dash / d
        if base.is_dir():
            files += ["../dashboard/" + p.relative_to(dash).as_posix() for p in base.rglob("*") if p.is_file() and not p.is_symlink() and p.name != ".DS_Store"]
    return sorted(files)


def src_hash(cli_dir: Path = CLI_DIR) -> str:
    lines = "".join(f"{rel}\0{hashlib.sha256((cli_dir / rel).read_bytes()).hexdigest()}\n" for rel in source_files(cli_dir))
    return hashlib.sha256(lines.encode("utf-8")).hexdigest()


def banner_hash(bundle: Path) -> str | None:
    if not bundle.is_file():
        return None
    m = BANNER_RE.search(bundle.read_bytes()[:400].decode("utf-8", "replace"))
    return m.group(1) if m else None


def cli_bundle() -> Path:
    """지금 소스에서 만든 번들 경로. dist → (esbuild 가 있으면) 빌드 → 플러그인 사본 순서로 찾는다."""
    want = src_hash()
    if banner_hash(DIST) == want:
        return DIST
    if shutil.which("node") and (CLI_DIR / "node_modules/esbuild").exists():
        r = subprocess.run(["node", str(CLI_DIR / "build.mjs")], cwd=CLI_DIR, capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and banner_hash(DIST) == want:
            return DIST
    if banner_hash(PLUGIN_BIN) == want:
        return PLUGIN_BIN
    raise RuntimeError("지금 소스에서 만든 CLI 번들이 없다. 킷 루트에서 pnpm install && pnpm build 를 먼저 돌린다")
