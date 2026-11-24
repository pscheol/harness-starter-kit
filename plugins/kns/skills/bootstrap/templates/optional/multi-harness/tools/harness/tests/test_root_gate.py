"""루트 게이트가 바뀐 도메인의 게이트만 부른다(HK-6, 설계 01 §3.4). 설치본의 scripts/ 를 쓴다."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

TOOL = Path(__file__).resolve().parents[1]
REPO_SCRIPTS = TOOL.parents[1] / 'scripts'
IDENTITY = ['-c', 'user.email=harness@example.invalid', '-c', 'user.name=harness']
CLEARED = ('CLAUDECODE', 'CI', 'HARNESS_VERIFY_LEVEL', 'HARNESS_VERIFY_PARENT', 'HARNESS_VERIFY_RECORDING', 'HARNESS_VERIFY_TRIGGER')
ENTRY = '''# BEGIN HARNESS VERIFICATION ENTRY
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-entry.sh"
# END HARNESS VERIFICATION ENTRY
'''


def copy_scripts(target):
    """설치본의 검증 스크립트(진입 · 변경 검증 · harness · hooks)를 임시 하네스에 복사한다."""
    (target / 'scripts').mkdir(parents=True)
    for name in ('verify-changed.py', 'verify-entry.sh'):
        shutil.copy2(REPO_SCRIPTS / name, target / 'scripts' / name)
    for name in ('harness', 'hooks'):
        shutil.copytree(REPO_SCRIPTS / name, target / 'scripts' / name, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))


@unittest.skipUnless((REPO_SCRIPTS / 'verify-changed.py').is_file(), '설치본(scripts/verify-changed.py)에서 돈다')
class RootGateTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='harness root gate ')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve() / 'root'
        self.calls = self.root.parent / 'calls.txt'
        copy_scripts(self.root)
        (self.root / 'tools/harness').mkdir(parents=True)
        shutil.copy2(TOOL / 'gates.py', self.root / 'tools/harness/gates.py')
        units = [{'id': 'root', 'path': '.', 'stack': 'monorepo'}]
        for name in ('domain-a', 'domain-b', 'domain-c'):
            units.append({'id': name, 'path': name, 'stack': 'domain'})
            self.write(f'{name}/.agents/harness.json', json.dumps({'unit': name, 'stack': 'domain'}))
            self.write(f'{name}/guide.md', '# 원본\n')
            self.write(f'{name}/scripts/verify.sh', '#!/usr/bin/env bash\n'
                       f'printf "%s|%s|%s|%s\\n" "$(basename "$PWD")" "${{HARNESS_VERIFY_LEVEL:-}}" "${{HARNESS_VERIFY_PARENT:-}}" "$*" >> "{self.calls}"\n'
                       'echo "검증 passed(affected) — 하위"\n')
        self.write('tools/harness/units.json', json.dumps({'units': units}))
        self.write('.agents/harness.json', json.dumps({'unit': 'root', 'stack': 'monorepo'}))
        self.write('README.md', '# 루트\n')
        self.git('init', '-q', '-b', 'develop')
        self.git('add', '-A')
        self.git(*IDENTITY, 'commit', '-q', '-m', 'base')
        self.git('update-ref', 'refs/remotes/origin/develop', self.git('rev-parse', 'HEAD'))
        self.git('checkout', '-q', '-b', 'feat/HK-6-x')
        self.env = {**{key: value for key, value in os.environ.items() if key not in CLEARED}, 'PYTHONDONTWRITEBYTECODE': '1'}

    def write(self, relative, text):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        if path.suffix == '.sh':
            path.chmod(0o755)
        return path

    def git(self, *arguments):
        return subprocess.run(['git', '-C', str(self.root), *arguments], capture_output=True, text=True, check=True).stdout.strip()

    def affected(self, *arguments):
        return subprocess.run([sys.executable, str(self.root / 'scripts/verify-changed.py'), '--level', 'affected', *arguments],
                              cwd=self.root, env=self.env, capture_output=True, text=True, timeout=120)

    def called(self):
        return self.calls.read_text().splitlines() if self.calls.exists() else []

    def test_only_the_changed_domain_gate_runs(self):
        self.write('domain-b/guide.md', '# 고침\n')
        result = self.affected()
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        log = result.stderr.splitlines()
        self.assertEqual(['▶ 하네스 domain-b (affected)'], [line for line in log if line.startswith('▶ 하네스')])
        self.assertEqual(['↷ domain-a 건너뜀 — 변경 없음', '↷ domain-c 건너뜀 — 변경 없음'], [line for line in log if line.startswith('↷')])
        self.assertEqual(['domain-b|affected|affected|--affected --summary'], self.called())
        report = json.loads(result.stdout)
        self.assertEqual([{'id': 'domain-a', 'reason': 'no-change'}, {'id': 'domain-c', 'reason': 'no-change'}], report['skippedUnits'])

    def test_plan_lists_the_gate_without_running_it(self):
        self.write('domain-b/guide.md', '# 고침\n')
        result = self.affected('--plan')
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        plan = json.loads(result.stdout)
        gates = [command for command in plan['commands'] if command['kind'] == 'gate']
        self.assertEqual([str(self.root / 'domain-b')], [command['cwd'] for command in gates])
        self.assertEqual({'HARNESS_VERIFY_LEVEL': 'affected', 'HARNESS_VERIFY_PARENT': 'affected'}, gates[0]['env'])
        self.assertEqual([], self.called())

    def test_root_file_outside_domains_runs_no_domain_gate(self):
        self.write('README.md', '# 루트 고침\n')
        result = self.affected()
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual([], self.called())
        self.assertEqual(3, len([line for line in result.stderr.splitlines() if line.startswith('↷')]))

    def test_explicit_files_pick_their_domain_and_pass_relative_paths(self):
        self.write('domain-c/guide.md', '# 고침\n')
        result = self.affected('--files', 'domain-c/guide.md')
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(['domain-c|affected|affected|--affected --summary --files guide.md'], self.called())

    def test_record_points_to_the_domain_record(self):
        self.write('domain-b/guide.md', '# 고침\n')
        self.assertEqual(0, self.affected().returncode)
        record = json.loads((self.root / '.agents/state/verify-last.json').read_text())
        gate = next(unit for unit in record['units'] if unit['id'] == 'domain-b')
        self.assertEqual('domain-b/.agents/state/verify-last.json', gate['lastRun'])
        self.assertEqual(['domain-a', 'domain-c'], [unit['id'] for unit in record['skippedUnits']])


@unittest.skipUnless((REPO_SCRIPTS / 'verify-entry.sh').is_file(), '설치본(scripts/verify-entry.sh)에서 돈다')
class RootFullLoopTest(unittest.TestCase):
    """fast · full 본문이 부른 하위 게이트는 HARNESS_VERIFY_PARENT 를 받아 HK-2 보조 점검에 막히지 않는다(R4.5)."""

    def test_child_full_called_by_an_allowed_root_full_is_not_blocked(self):
        directory = tempfile.TemporaryDirectory(prefix='harness root full ')
        self.addCleanup(directory.cleanup)
        root = Path(directory.name).resolve()
        for target in (root, root / 'domain'):
            copy_scripts(target)
            (target / '.agents').mkdir(parents=True, exist_ok=True)
            (target / '.agents/harness.json').write_text(json.dumps({'unit': target.name, 'stack': 'domain'}))
        # 루트만 에이전트 세션 full 을 허용한다. 하위(도메인)는 기본값(막음)이다.
        (root / '.agents/knots-sync.json').write_text(json.dumps({'verify': {'fullOnlyInCI': False}}))
        (root / 'domain/scripts/verify.sh').write_text('#!/usr/bin/env bash\nset -uo pipefail\n' + ENTRY + 'echo "domain body ${HARNESS_VERIFY_PARENT:-}"\n')
        (root / 'scripts/verify.sh').write_text('#!/usr/bin/env bash\nset -uo pipefail\n' + ENTRY
                                                 + 'cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2\n'
                                                 + 'echo "▶ 하네스 domain (full)"\nbash domain/scripts/verify.sh --full || exit $?\n')
        env = {**{key: value for key, value in os.environ.items() if key not in CLEARED}, 'PYTHONDONTWRITEBYTECODE': '1', 'CLAUDECODE': '1'}
        result = subprocess.run(['bash', str(root / 'scripts/verify.sh'), '--full'], env=env, capture_output=True, text=True, timeout=60)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn('domain body full', result.stdout)
        direct = subprocess.run(['bash', str(root / 'domain/scripts/verify.sh'), '--full'], env=env, capture_output=True, text=True, timeout=60)
        self.assertEqual(3, direct.returncode, direct.stdout + direct.stderr)


if __name__ == '__main__':
    unittest.main()
