#!/usr/bin/env bash
# 도메인 리포 파일이 다른 도메인의 경로를 참조하는 것을 알린다(설계 10 §3.5).
#
# 왜 필요한가:
#   도메인 리포는 서로 독립해 배포한다. `../<다른 도메인>/` · `domains/<다른 도메인>/` 로 파일을 읽거나,
#   다른 도메인의 패키지를 import 하면 한쪽을 고칠 때 다른 쪽이 조용히 깨진다. 도메인 사이는 계약(상위 리포의
#   계약 Unit)으로만 만난다.
#
# 검사: tools/harness/units.json 의 단위(path 가 "." 이 아닌 것)마다, 그 단위 안의 추적 파일에서 다른 단위의
#   ① `../<폴더 이름>/`  ② `<상위 기준 경로>/`  ③ 단위 `packages` 목록의 패키지 이름(import · require · from)
#   을 찾는다. 예외는 .agents/guards/cross-domain-allow.txt(`경로 사유`, 사유가 없으면 그 줄이 위반).
#
# 종료 코드: 위반이 있으면 1(실행기 run-guards.sh 가 경고 수준이면 게이트를 막지 않고 보고만 한다).
#
# harness-guard-enforce: 0
#
# 규약·승격 절차 원본: .agents/rules/platform-invariants.md · cross-repo.md
set -uo pipefail

REGISTRY="tools/harness/units.json"
ALLOW=".agents/guards/cross-domain-allow.txt"
[ -f "$REGISTRY" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

exec python3 - "$REGISTRY" "$ALLOW" <<'PY'
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

registry, allow_file = sys.argv[1], sys.argv[2]
units = [u for u in json.loads(Path(registry).read_text(encoding="utf-8")).get("units", []) if u.get("path") not in (None, "", ".")]
root = Path(".")
bad = []

allow = []
if Path(allow_file).is_file():
    for number, raw in enumerate(Path(allow_file).read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) < 2 or not parts[1].strip():
            bad.append(f"{allow_file}:{number}: 예외 '{parts[0]}' 에 사유가 없다")
            continue
        allow.append(parts[0])


def tracked(unit_path):
    folder = root / unit_path
    inner = subprocess.run(["git", "-C", str(folder), "ls-files"], capture_output=True, text=True)
    if inner.returncode == 0 and inner.stdout.strip() and (folder / ".git").exists():
        return [f"{unit_path}/{f}" for f in inner.stdout.splitlines()]
    outer = subprocess.run(["git", "ls-files", "--", unit_path], capture_output=True, text=True)
    if outer.returncode == 0 and outer.stdout.strip():
        return outer.stdout.splitlines()
    return [p.as_posix() for p in folder.rglob("*") if p.is_file() and ".git" not in p.parts and "node_modules" not in p.parts]


def allowed(path):
    return any(fnmatch.fnmatch(path, pattern) for pattern in allow)


for unit in units:
    others = [o for o in units if o is not unit]
    patterns = []
    for other in others:
        name = Path(other["path"]).name
        patterns.append((other["id"], re.compile(r"\.\./(?:\.\./)*" + re.escape(name) + r"/"), "../" + name + "/"))
        patterns.append((other["id"], re.compile(r"(?<![\w.-])" + re.escape(other["path"].rstrip("/")) + r"/"), other["path"].rstrip("/") + "/"))
        for package in other.get("packages") or []:
            patterns.append((other["id"], re.compile(r"(?:import|from|require|use)\b[^\n]*['\"\s(]" + re.escape(package) + r"[\w.]*"), package))
    for path in tracked(unit["path"]):
        if allowed(path):
            continue
        file = root / path
        try:
            if file.stat().st_size > 1_000_000:
                continue
            text = file.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for number, line in enumerate(text.splitlines(), 1):
            for other_id, pattern, label in patterns:
                if pattern.search(line):
                    bad.append(f"{path}:{number}: 다른 도메인({other_id})을 참조한다: {label}")
                    break

for line in bad:
    print(line)
sys.exit(1 if bad else 0)
PY
