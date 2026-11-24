import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

GATES = Path(__file__).resolve().parents[1] / 'gates.py'


class GatesTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='harness gates ')
        self.addCleanup(directory.cleanup)
        self.repo = Path(directory.name)
        (self.repo / 'tools/harness').mkdir(parents=True)

    def gates(self, units):
        (self.repo / 'tools/harness/units.json').write_text(json.dumps({'units': units}))
        result = subprocess.run([sys.executable, str(GATES), '--repo', str(self.repo)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return [line.split() for line in result.stdout.splitlines()]

    def test_lists_only_harnesses_not_inside_another_registered_harness(self):
        rows = self.gates([
            {'id': 'monorepo', 'path': '.'},
            {'id': 'domain-app', 'path': 'acme-domain-app'},
            {'id': 'app-web', 'path': 'acme-domain-app/acme-app-web'},
            {'id': 'infra', 'path': 'acme-infra'},
        ])

        self.assertEqual(rows, [['domain-app', 'acme-domain-app', 'full'], ['infra', 'acme-infra', 'full']])

    def test_carries_the_root_verify_ceiling(self):
        rows = self.gates([{'id': 'domain-platform', 'path': 'acme-domain-platform', 'rootVerify': 'fast'}])

        self.assertEqual(rows, [['domain-platform', 'acme-domain-platform', 'fast']])

    def test_a_sibling_with_a_common_prefix_is_not_nested(self):
        rows = self.gates([{'id': 'a', 'path': 'acme-domain'}, {'id': 'b', 'path': 'acme-domain-app'}])

        self.assertEqual([row[0] for row in rows], ['a', 'b'])

    def test_keeps_units_when_no_domain_is_registered(self):
        rows = self.gates([{'id': 'monorepo', 'path': '.'}, {'id': 'app-web', 'path': 'acme-domain-app/acme-app-web'}])

        self.assertEqual(rows, [['app-web', 'acme-domain-app/acme-app-web', 'full']])



IDENTITY = ['-c', 'user.email=harness@example.invalid', '-c', 'user.name=harness']


class ChangedGatesTest(unittest.TestCase):
    """--changed: 루트 변경 집합 · submodule 포인터 · submodule 작업 트리 · submodule 의 원격 base 밖 커밋(설계 01 §3.4)."""

    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='harness changed gates ')
        self.addCleanup(directory.cleanup)
        self.repo = Path(directory.name).resolve()
        (self.repo / 'tools/harness').mkdir(parents=True)
        units = [{'id': 'root', 'path': '.'}] + [{'id': f'domain-{name}', 'path': f'domain-{name}'} for name in 'abc']
        (self.repo / 'tools/harness/units.json').write_text(json.dumps({'units': units}))
        for name in 'ab':  # 도메인 a · b 는 submodule(중첩 저장소), c 는 루트 저장소의 폴더
            nested = self.repo / f'domain-{name}'
            nested.mkdir()
            self.git('init', '-q', '-b', 'develop', cwd=nested)
            (nested / 'guide.md').write_text('# 원본\n')
            self.commit(nested)
            self.publish(nested)
        (self.repo / 'domain-c').mkdir()
        (self.repo / 'domain-c/guide.md').write_text('# 원본\n')
        self.git('init', '-q', '-b', 'develop')
        self.commit(self.repo)
        self.publish(self.repo)
        self.git('checkout', '-q', '-b', 'feat/HK-6-x')

    def git(self, *arguments, cwd=None):
        return subprocess.run(['git', '-C', str(cwd or self.repo), *arguments], capture_output=True, text=True, check=True).stdout.strip()

    def commit(self, cwd, message='base'):
        self.git('add', '-A', cwd=cwd)
        self.git(*IDENTITY, 'commit', '-q', '--allow-empty', '-m', message, cwd=cwd)

    def publish(self, cwd):
        self.git('update-ref', 'refs/remotes/origin/develop', self.git('rev-parse', 'HEAD', cwd=cwd), cwd=cwd)

    def changed(self, *extra):
        result = subprocess.run([sys.executable, str(GATES), '--repo', str(self.repo), '--changed', *extra], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout

    def ids(self, *extra):
        return [line.split()[0] for line in self.changed(*extra).splitlines()]

    def reasons(self):
        rows = json.loads(self.changed('--json'))
        return {row['id']: row['reasons'] for row in rows if row['changed']}

    def test_nothing_changed_lists_no_domain(self):
        self.assertEqual([], self.ids('--base', 'origin/develop'))
        self.assertEqual({}, self.reasons())

    def test_root_file_under_a_domain_folder(self):
        (self.repo / 'domain-c/guide.md').write_text('# 고침\n')
        self.assertEqual(['domain-c'], self.ids('--base', 'origin/develop'))
        (self.repo / 'domain-c/guide.md').write_text('# 원본\n')
        (self.repo / 'domain-c/new.md').write_text('# 새 파일\n')
        self.assertEqual({'domain-c': ['path']}, self.reasons())

    def test_submodule_work_tree_change(self):
        (self.repo / 'domain-b/guide.md').write_text('# 고침\n')
        self.assertIn('worktree', self.reasons()['domain-b'])
        self.assertEqual(['domain-b'], self.ids())

    def test_submodule_pointer_change(self):
        nested = self.repo / 'domain-a'
        (nested / 'guide.md').write_text('# 둘째\n')
        self.commit(nested, 'second')
        self.publish(nested)  # 원격 base 에도 있는 커밋 — 포인터만 바뀌었다
        self.git('add', 'domain-a')
        self.assertEqual({'domain-a': ['pointer']}, self.reasons())

    def test_submodule_commit_missing_from_its_remote_base(self):
        nested = self.repo / 'domain-a'
        (nested / 'guide.md').write_text('# 둘째\n')
        self.commit(nested, 'second')
        self.git('add', 'domain-a')
        self.commit(self.repo, 'pointer')
        self.publish(self.repo)  # 루트 base 에는 포인터가 이미 있다 — 도메인 리포의 develop 에만 없다
        self.assertEqual({'domain-a': ['unmerged']}, self.reasons())

    def test_missing_base_ref_exits_2_with_fetch_hint(self):
        result = subprocess.run([sys.executable, str(GATES), '--repo', str(self.repo), '--changed', '--base', 'origin/nope'], capture_output=True, text=True)
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertIn('base ref 없음: origin/nope — git fetch origin nope 뒤 다시 실행', result.stderr)

    def test_listing_without_changed_still_lists_every_domain(self):
        result = subprocess.run([sys.executable, str(GATES), '--repo', str(self.repo)], capture_output=True, text=True)
        self.assertEqual(['domain-a', 'domain-b', 'domain-c'], [line.split()[0] for line in result.stdout.splitlines()])


if __name__ == '__main__':
    unittest.main()
