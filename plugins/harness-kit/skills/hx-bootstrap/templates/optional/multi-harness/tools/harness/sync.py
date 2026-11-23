#!/usr/bin/env python3
"""공통 하네스 파일을 각 단위에 배포하고, 단위의 복사본이 원본과 같은지 검사한다.

원본은 tools/harness/shared/ 이고 대상 목록은 tools/harness/units.json 이다.
단위는 받은 복사본만으로 동작해야 하므로 링크나 심볼릭 링크가 아니라 파일을 쓴다.

    python3 tools/harness/sync.py            # 모든 단위에 쓴다
    python3 tools/harness/sync.py --check    # 쓰지 않고 차이만 보고한다(차이가 있으면 1)
    python3 tools/harness/sync.py --unit web # 한 단위만
    python3 tools/harness/sync.py --adopt    # 목록에 없던 기존 파일을 공통 원본으로 덮어쓴다(처음 받아들일 때)
    python3 tools/harness/sync.py --snapshot /tmp/harness-before.json # 원본 수정 전에 대상 상태만 저장
    python3 tools/harness/sync.py --baseline /tmp/harness-before.json # 그 뒤 바뀐 대상이 있으면 중단
"""
import argparse
from contextlib import nullcontext
import fnmatch
import hashlib
import json
from pathlib import Path
import re
import stat
import sys

# 읽기 전용 검사에서도 helper import가 리포에 __pycache__를 만들 수 있다.
sys.dont_write_bytecode = True

from sync_safety import (
    SafetyError, atomic_write, collect_states, deployment_lock, file_state,
    load_snapshot, safe_unlink, state_changes, validate_path,
)

TOOL = Path(__file__).resolve().parent
MANIFEST = '.agents/harness.json'
IGNORED_PARTS = {'__pycache__', '.DS_Store', '.pytest_cache', '.mypy_cache', '.ruff_cache'}
UNIT_TOKENS = ('UNIT_ID', 'UNIT_TITLE', 'UNIT_PATH', 'UNIT_STACK')
ID_PATTERN = re.compile(r'^[a-z][a-z0-9-]*$')


class RegistryError(Exception):
    pass


def load_units(repo, registry_path):
    data = json.loads(registry_path.read_text())
    units = []
    seen = set()
    for raw in data.get('units', []):
        unit_id = raw.get('id', '')
        if not ID_PATTERN.fullmatch(unit_id) or unit_id in seen:
            raise RegistryError(f'invalid or duplicate unit id: {unit_id!r}')
        seen.add(unit_id)
        relative = raw.get('path', '')
        target = repo / relative
        if Path(relative).is_absolute() or '..' in Path(relative).parts or not target.resolve().is_relative_to(repo):
            raise RegistryError(f'{unit_id}: path escapes the repository: {relative}')
        validate_path(repo, target, directory=True)
        if not target.is_dir():
            raise RegistryError(f'{unit_id}: unit directory does not exist: {relative}')
        units.append({
            'id': unit_id,
            'path': relative,
            'root': target,
            'title': raw.get('title', unit_id),
            'stack': raw.get('stack', ''),
            'exclude': list(raw.get('exclude', [])),
        })
    return units


def source_files(shared):
    files = []
    validate_path(shared.parent, shared, directory=True)
    for path in sorted(shared.rglob('*')):
        if IGNORED_PARTS.intersection(path.relative_to(shared).parts):
            continue
        if path.is_symlink():
            raise SafetyError(f'symlink source refused: {path}')
        if not path.is_file():
            continue
        validate_path(shared, path)
        files.append(path)
    return files


def render(text, unit):
    values = {
        'UNIT_ID': unit['id'],
        'UNIT_TITLE': unit['title'],
        'UNIT_PATH': unit['path'],
        'UNIT_STACK': unit['stack'],
    }
    # 단위 토큰만 바꾼다. SDD 템플릿의 {{FEATURE_NAME}} 같은 토큰은 스캐폴딩 시점에 채워진다.
    for token in UNIT_TOKENS:
        text = text.replace('{{' + token + '}}', values[token])
    return text


def planned_files(shared, unit):
    """(배포할 파일, 원본에는 있지만 exclude 로 뺀 경로)."""
    planned, excluded = {}, set()
    for source in source_files(shared):
        relative = source.relative_to(shared).as_posix().replace('__UNIT_ID__', unit['id'])
        if any(fnmatch.fnmatch(relative, pattern) for pattern in unit['exclude']):
            excluded.add(relative)
            continue
        executable = bool(source.stat().st_mode & stat.S_IXUSR)
        if relative == MANIFEST:
            raise RegistryError(f'{source}: reserved deployment manifest cannot be a shared source')
        planned[relative] = (render(source.read_text(), unit), executable)
    return planned, excluded


def collisions(unit, planned, previous):
    """지난 배포 목록에 없던 기존 파일과 내용이 다르면 단위 고유 파일일 수 있다. 덮어쓰지 않는다."""
    found = []
    for relative, (text, _) in planned.items():
        target = unit['root'] / relative
        if relative not in previous and target.is_file() and target.read_text() != text:
            found.append(f"collision: {unit['path']}/{relative} — 단위 파일과 겹친다. 원본 이름을 바꾸거나 --adopt 로 덮어쓴다")
    return found


def stale(previous, planned, excluded):
    """원본에서 사라진 공통 파일. exclude 로 뺀 파일은 단위가 가져간 것이라 지우지 않는다."""
    return sorted(previous - set(planned) - excluded)


def planned_state(text, executable, original):
    executable_bits = stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
    mode = original['mode'] if original else 0o644
    return {
        'sha256': hashlib.sha256(text.encode('utf-8')).hexdigest(),
        'mode': mode | executable_bits if executable else mode & ~executable_bits,
        'executable': executable,
    }


def manifest_text(unit, planned, original_states=None):
    originals = original_states if original_states is not None else collect_states(unit['root'], planned)
    manifest = {
        'unit': unit['id'],
        'title': unit['title'],
        'stack': unit['stack'],
        'source': 'tools/harness/shared',
        'shared': sorted(planned),
        'deployed': {
            relative: planned_state(text, executable, originals[relative])
            for relative, (text, executable) in sorted(planned.items())
        },
    }
    return json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'


def previous_shared(unit, others):
    """지난 배포 목록. 이 목록으로 파일을 지우므로 하네스 밖이나 다른 단위를 가리키는 항목은 거부한다."""
    path = unit['root'] / MANIFEST
    validate_path(unit['root'], path)
    if not path.is_file():
        return set()
    try:
        shared = json.loads(path.read_text()).get('shared', [])
    except ValueError as error:
        raise RegistryError(f"{unit['path']}/{MANIFEST}: invalid JSON: {error}") from error
    if not isinstance(shared, list):
        raise RegistryError(f"{unit['path']}/{MANIFEST}: shared must be a list")
    root = unit['root']
    for relative in shared:
        if not isinstance(relative, str) or not relative or Path(relative).is_absolute() or '..' in Path(relative).parts:
            raise RegistryError(f"{unit['path']}/{MANIFEST}: invalid shared path {relative!r}")
        target = (root / relative).resolve()
        if not target.is_relative_to(root) or any(target.is_relative_to(other) for other in others):
            raise RegistryError(f"{unit['path']}/{MANIFEST}: shared path leaves the harness: {relative}")
    return set(shared)


def differences(unit, planned, excluded, previous):
    problems = []
    root = unit['root']
    for relative, (text, executable) in planned.items():
        target = root / relative
        label = f"{unit['path']}/{relative}"
        if not target.is_file():
            problems.append(f'missing: {label}')
        elif target.read_text() != text:
            problems.append(f'differs: {label}')
        elif executable != bool(target.stat().st_mode & stat.S_IXUSR):
            problems.append(f'mode differs: {label}')
    for relative in stale(previous, planned, excluded):
        if (root / relative).exists():
            problems.append(f"stale: {unit['path']}/{relative}")
    for relative in sorted(previous & excluded):
        problems.append(f"excluded: {unit['path']}/{relative} — 배포 목록에서만 뺀다(파일은 남는다)")
    manifest = root / MANIFEST
    if not manifest.is_file() or manifest.read_text() != manifest_text(unit, planned):
        problems.append(f"differs: {unit['path']}/{MANIFEST}")
    return problems


def apply(repo, unit, planned, excluded, previous, expected):
    root = unit['root']
    changed = 0
    for relative, (text, executable) in planned.items():
        target = root / relative
        repository_relative = target.relative_to(repo).as_posix()
        original = expected[repository_relative]
        deployment = planned_state(text, executable, original)
        desired = {'sha256': deployment['sha256'], 'mode': deployment['mode']}
        if original != desired:
            atomic_write(repo, repository_relative, text, deployment['mode'], original)
            changed += 1
        elif file_state(repo, repository_relative) != original:
            raise SafetyError(f'changed since snapshot: {repository_relative}')
    for relative in stale(previous, planned, excluded):
        target = root / relative
        repository_relative = target.relative_to(repo).as_posix()
        original = expected[repository_relative]
        if original is not None:
            safe_unlink(repo, repository_relative, original)
            changed += 1
    manifest = root / MANIFEST
    originals = {relative: expected[(root / relative).relative_to(repo).as_posix()] for relative in planned}
    text = manifest_text(unit, planned, originals)
    repository_relative = manifest.relative_to(repo).as_posix()
    original = expected[repository_relative]
    digest = hashlib.sha256(text.encode('utf-8')).hexdigest()
    if original is None or original['sha256'] != digest:
        atomic_write(repo, repository_relative, text, original['mode'] if original else 0o644, original)
    elif file_state(repo, repository_relative) != original:
        raise SafetyError(f'changed since snapshot: {repository_relative}')
    return changed


def deployment_paths(repo, plans):
    return [
        (unit['root'] / relative).relative_to(repo).as_posix()
        for unit, planned, _, previous in plans
        for relative in set(planned) | previous | {MANIFEST}
    ]


def matches_plan(actual, desired):
    if desired is None:
        return actual is None
    if actual is None:
        return False
    return (actual['sha256'] == hashlib.sha256(desired[0].encode('utf-8')).hexdigest()
            and bool(actual['mode'] & stat.S_IXUSR) == desired[1])


def matches_deployment(actual, recorded):
    if actual is None or not isinstance(recorded, dict):
        return False
    return (actual['sha256'] == recorded.get('sha256')
            and bool(actual['mode'] & stat.S_IXUSR) == recorded.get('executable')
            and actual['mode'] == recorded.get('mode', actual['mode']))


def managed_changes(repo, plans, expected):
    problems = []
    for unit, planned, excluded, previous in plans:
        manifest = unit['root'] / MANIFEST
        deployed = json.loads(manifest.read_text()).get('deployed', {}) if manifest.is_file() else {}
        if not isinstance(deployed, dict):
            raise RegistryError(f'{manifest}: deployed must be an object')
        for relative in (previous & set(planned)) | set(stale(previous, planned, excluded)):
            label = (unit['root'] / relative).relative_to(repo).as_posix()
            actual = expected[label]
            recorded = deployed.get(relative)
            if recorded is None:
                if not matches_plan(actual, planned.get(relative)):
                    problems.append(f'baseline required: {label} — 이전 배포 지문이 없다')
                continue
            if not matches_deployment(actual, recorded):
                problems.append(f'local change: {label} — 공통 복사본이 지난 배포와 다르다')
    return problems


def select_units(all_units, selected):
    known = {unit['id'] for unit in all_units}
    unknown = sorted(set(selected) - known)
    if unknown:
        raise RegistryError(f"unknown unit: {', '.join(unknown)} (known: {', '.join(sorted(known))})")
    return [unit for unit in all_units if not selected or unit['id'] in selected]


def build_plans(repo, all_units, units, registry_state):
    shared = repo / 'tools/harness/shared'
    source_states = collect_states(repo, [path.relative_to(repo).as_posix() for path in source_files(shared)])
    input_states = {**source_states, 'tools/harness/units.json': registry_state}
    roots = {unit['id']: unit['root'] for unit in all_units}
    plans = []
    for unit in units:
        manifest_relative = (unit['root'] / MANIFEST).relative_to(repo).as_posix()
        input_states[manifest_relative] = file_state(repo, manifest_relative)
        others = [root for unit_id, root in roots.items() if unit_id != unit['id'] and root != unit['root']
                  and root.is_relative_to(unit['root'])]
        planned, excluded = planned_files(shared, unit)
        previous = previous_shared(unit, others)
        for relative in planned:
            target = unit['root'] / relative
            if any(target.is_relative_to(other) for other in others):
                raise RegistryError(f'{target}: shared path leaves the harness')
        plans.append((unit, planned, excluded, previous))
    return plans, input_states, source_states


def save_snapshot(output, repo, plans, input_states, expected):
    output = output.absolute()
    tool = repo / 'tools/harness'
    paths = deployment_paths(repo, plans)
    if output.resolve() == (tool / 'units.json').resolve() or output.resolve().is_relative_to((tool / 'shared').resolve()):
        raise RegistryError('snapshot output must not overwrite harness inputs')
    if output.resolve() in {(repo / path).resolve() for path in paths}:
        raise RegistryError('snapshot output must not overwrite a deployment target')
    snapshot_states = {**input_states, **expected}
    changes = state_changes(repo, snapshot_states)
    if changes:
        raise SafetyError('\n'.join(changes))
    snapshot_root = output.parent.resolve()
    atomic_write(snapshot_root, output.name, json.dumps(snapshot_states, indent=2) + '\n', 0o600,
                 file_state(snapshot_root, output.name))
    print(f'snapshot: {output} ({len(snapshot_states)} paths; 대상 파일은 쓰지 않았다)')


def check_plans(plans, clashes):
    problems = []
    for unit, planned, excluded, previous in plans:
        problems += differences(unit, planned, excluded, previous)
    problems += clashes
    if problems:
        print('\n'.join(problems))
        print('✖ 공통 하네스 파일이 원본과 다릅니다. tools/harness/shared 를 고치고 '
              'python3 tools/harness/sync.py 를 실행하십시오.', file=sys.stderr)
        return 1
    print(f'공통 하네스 파일 일치 — 단위 {len(plans)}개')
    return 0


def safety_conflicts(args, repo, plans, input_states, expected, source_states):
    if args.baseline:
        baseline = load_snapshot(args.baseline)
        problems = state_changes(repo, {path: baseline.get(path) for path in expected})
    else:
        problems = managed_changes(repo, plans, expected)
    problems += state_changes(repo, input_states)
    current_sources = {path.relative_to(repo).as_posix() for path in source_files(repo / 'tools/harness/shared')}
    if current_sources != set(source_states):
        problems.append('shared source paths changed during planning')
    return problems


def run(args):
    repo = args.repo.resolve()
    registry_state = file_state(repo, 'tools/harness/units.json')
    all_units = load_units(repo, repo / 'tools/harness/units.json')
    units = select_units(all_units, args.unit)
    plans, input_states, source_states = build_plans(repo, all_units, units, registry_state)
    expected = collect_states(repo, deployment_paths(repo, plans))
    if args.snapshot:
        save_snapshot(args.snapshot, repo, plans, input_states, expected)
        return 0
    clashes = [] if args.adopt else [c for unit, planned, _, previous in plans for c in collisions(unit, planned, previous)]
    if args.check:
        return check_plans(plans, clashes)
    problems = clashes + safety_conflicts(args, repo, plans, input_states, expected, source_states)
    if problems:
        print('\n'.join(problems), file=sys.stderr)
        print('✖ 아무것도 쓰지 않았다.', file=sys.stderr)
        return 1
    changes = state_changes(repo, expected)
    if changes:
        raise SafetyError('\n'.join(changes))
    for unit, planned, excluded, previous in plans:
        changed = apply(repo, unit, planned, excluded, previous, expected)
        print(f"{unit['id']}: {len(planned)} shared files, {changed} written or removed")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--check', action='store_true', help='쓰지 않고 차이만 보고한다(잠금 파일도 만들지 않는다)')
    modes.add_argument('--snapshot', type=Path, help='원본 수정 전 배포 대상 상태를 JSON에 저장하고 종료한다')
    parser.add_argument('--baseline', type=Path, help='배포 대상이 이 스냅샷 이후 바뀌었으면 쓰기 전에 중단한다')
    parser.add_argument('--unit', action='append', default=[], help='대상 단위 id (여러 번 줄 수 있다)')
    parser.add_argument('--adopt', action='store_true', help='목록에 없던 기존 파일을 공통 원본으로 덮어쓴다(변경 보호는 유지)')
    parser.add_argument('--repo', type=Path, default=TOOL.parents[1], help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.snapshot and args.baseline:
        parser.error('--snapshot and --baseline cannot be used together')
    try:
        with nullcontext() if args.check else deployment_lock(args.repo.resolve()):
            return run(args)
    except SafetyError as error:
        print(f'✖ {error}\n중단했다. 실행 중 변경이면 앞서 배포된 파일은 남을 수 있다.', file=sys.stderr)
        return 1
    except (RegistryError, OSError, ValueError) as error:
        print(f'✖ {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
