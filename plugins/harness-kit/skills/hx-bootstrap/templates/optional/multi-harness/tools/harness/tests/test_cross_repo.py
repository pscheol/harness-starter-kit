"""리포 간 조율: submodule 경계 검사 · 포인터 기록 · 도메인 간 경로 가드(HK-20b, 설계 10 §3.5 · 완료 기준 9). 설치본의 scripts/ 를 쓴다."""

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
CLEARED = ('CLAUDECODE', 'CI', 'HARNESS_VERIFY_LEVEL', 'HARNESS_VERIFY_PARENT', 'HARNESS_VERIFY_RECORDING', 'HARNESS_VERIFY_TRIGGER', 'GUARD_ENFORCE')
DOMAINS = ('domains/app', 'domains/api')


def run(args, cwd, env=None, check=True):
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, env=env, timeout=120, check=False)
    if check and result.returncode:
        raise AssertionError(f'{args} → {result.returncode}\n{result.stdout}{result.stderr}')
    return result


@unittest.skipUnless((REPO_SCRIPTS / 'harness/check_submodules.py').is_file(), '설치본(scripts/harness/check_submodules.py)에서 돈다')
class CrossRepoTest(unittest.TestCase):
    """hdr 형태 fixture: 상위 리포 + 도메인 submodule 2개(각자 로컬 bare 원격)."""

    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='harness cross repo ')
        self.addCleanup(directory.cleanup)
        self.base = Path(directory.name).resolve()
        self.env = {**{k: v for k, v in os.environ.items() if k not in CLEARED}, 'PYTHONDONTWRITEBYTECODE': '1',
                    'GIT_CONFIG_GLOBAL': str(self.base / 'gitconfig'), 'GIT_CONFIG_SYSTEM': os.devnull}
        (self.base / 'gitconfig').write_text('[protocol "file"]\n\tallow = always\n[init]\n\tdefaultBranch = develop\n')
        self.root = self.base / 'root'
        self.root.mkdir()
        self.git(self.root, 'init', '-q')
        for path in DOMAINS:
            remote = self.base / f'{Path(path).name}.git'
            seed = self.base / f'seed-{Path(path).name}'
            run(['git', 'init', '-q', '--bare', str(remote)], self.base, self.env)
            seed.mkdir()
            self.git(seed, 'init', '-q')
            (seed / 'README.md').write_text(f'{path}\n')
            self.git(seed, 'add', '-A')
            self.git(seed, *IDENTITY, 'commit', '-q', '-m', 'seed')
            self.git(seed, 'remote', 'add', 'origin', str(remote))
            self.git(seed, 'push', '-q', 'origin', 'HEAD:develop')
            self.git(self.root, 'submodule', 'add', '-q', '-b', 'develop', str(remote), path)
        (self.root / 'tools/harness').mkdir(parents=True)
        shutil.copy2(TOOL / 'gates.py', self.root / 'tools/harness/gates.py')
        (self.root / 'tools/harness/units.json').write_text(json.dumps({'schema': 'harness-kit.deploy-units/v1', 'units': [
            {'id': 'root', 'path': '.', 'stack': 'monorepo'}, {'id': 'app', 'path': DOMAINS[0], 'stack': 'electron', 'packages': ['@acme/api']}, {'id': 'api', 'path': DOMAINS[1], 'stack': 'jvm'}]}))
        (self.root / '.agents').mkdir()
        (self.root / '.agents/harness.json').write_text(json.dumps({'unit': 'root', 'stack': 'monorepo'}))
        (self.root / 'scripts/harness').mkdir(parents=True)
        shutil.copy2(REPO_SCRIPTS / 'harness/check_submodules.py', self.root / 'scripts/harness/check_submodules.py')
        (self.root / '.agents/docs').mkdir(parents=True)
        (self.root / '.agents/docs/specs-index.md').write_text('# 스펙 색인\n\n## 영역 등록표\n')
        self.git(self.root, 'add', '-A')
        self.git(self.root, *IDENTITY, 'commit', '-q', '-m', 'base')
        for path in DOMAINS:
            self.git(self.root / path, 'checkout', '-q', '-b', 'feat/KNOTS-17-parity')
        self.git(self.root, 'checkout', '-q', '-b', 'feat/KNOTS-17-parity')

    def git(self, cwd, *args):
        return run(['git', *args], cwd, self.env).stdout.strip()

    def check(self, *args):
        return run([sys.executable, str(self.root / 'scripts/harness/check_submodules.py'), *args], self.root, self.env, check=False)

    def commit_domain(self, path, name, push):
        folder = self.root / path
        (folder / name).write_text(f'{name}\n')
        self.git(folder, 'add', '-A')
        self.git(folder, *IDENTITY, 'commit', '-q', '-m', f'feat: {name}')
        if push:
            self.git(folder, 'push', '-q', 'origin', 'HEAD:feat/KNOTS-17-parity')
        return self.git(folder, 'rev-parse', 'HEAD')

    def test_ordered_commits_pass_and_the_index_records_both_domain_shas(self):
        sha = {path: self.commit_domain(path, 'feature.md', push=True) for path in DOMAINS}   # 제공 → 소비 순으로 push
        self.git(self.root, 'add', *DOMAINS)                                               # 마지막에 상위 포인터
        result = self.check()
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn('문제 0', result.stdout)
        self.git(self.root, *IDENTITY, 'commit', '-q', '-m', 'feat: pointers KNOTS-17')
        record = self.check('--record', 'KNOTS-17', '--merged', '2026-11-24')
        self.assertEqual(0, record.returncode, record.stdout + record.stderr)
        text = (self.root / '.agents/docs/specs-index.md').read_text()
        self.assertIn(f'| {sha[DOMAINS[0]][:7]} |', text)
        self.assertIn(f'| {sha[DOMAINS[1]][:7]} |', text)
        self.assertIn('| 이슈 | 단계 | domains/api | domains/app | 병합 |', text)
        self.assertIn('2026-11-24', text)
        # 다시 적어도 행은 하나, 손으로 쓴 앞부분은 그대로
        self.assertEqual(0, self.check('--record', 'KNOTS-17').returncode)
        again = (self.root / '.agents/docs/specs-index.md').read_text()
        self.assertEqual(1, again.count('| KNOTS-17'))
        self.assertTrue(again.startswith('# 스펙 색인\n\n## 영역 등록표\n'))

    def test_pointer_committed_before_the_domain_is_pushed_is_caught(self):
        sha = self.commit_domain(DOMAINS[0], 'feature.md', push=False)
        self.git(self.root, 'add', DOMAINS[0])
        result = self.check()
        self.assertEqual(1, result.returncode, result.stdout)
        self.assertIn('[pointer]', result.stdout)
        self.assertIn(sha[:7], result.stdout)
        self.git(self.root / DOMAINS[0], 'push', '-q', 'origin', 'HEAD:feat/KNOTS-17-parity')
        self.assertEqual(0, self.check().returncode)

    def test_dirty_submodule_blocks_a_staged_pointer_but_only_warns_otherwise(self):
        self.commit_domain(DOMAINS[0], 'feature.md', push=True)
        (self.root / DOMAINS[0] / 'wip.md').write_text('작업 중\n')
        warn = self.check()
        self.assertEqual(0, warn.returncode, warn.stdout)
        self.assertIn('▲', warn.stdout)
        self.git(self.root, 'add', DOMAINS[0])
        blocked = self.check()
        self.assertEqual(1, blocked.returncode)
        self.assertIn('[dirty]', blocked.stdout)

    def test_branch_issue_keys_must_match_and_uninitialized_domains_fail(self):
        self.git(self.root / DOMAINS[1], 'checkout', '-q', '-b', 'feat/KNOTS-99-other')
        mismatch = self.check('--domain', DOMAINS[1])
        self.assertEqual(1, mismatch.returncode)
        self.assertIn('[branch]', mismatch.stdout)
        self.assertEqual(0, self.check('--domain', DOMAINS[0]).returncode)
        run(['git', 'submodule', 'deinit', '-q', '-f', DOMAINS[0]], self.root, self.env)
        uninit = self.check('--domain', DOMAINS[0])
        self.assertEqual(1, uninit.returncode)
        self.assertIn('[init]', uninit.stdout)

    def test_affected_checks_only_changed_submodules(self):
        for name in ('verify-changed.py', 'verify-entry.sh'):
            shutil.copy2(REPO_SCRIPTS / name, self.root / 'scripts' / name)
        for name in ('harness', 'hooks'):
            shutil.copytree(REPO_SCRIPTS / name, self.root / 'scripts' / name, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'), dirs_exist_ok=True)
        verify = self.root / DOMAINS[0] / 'scripts/verify.sh'   # api 에는 두지 않는다(작업 트리를 더럽혀 바뀐 도메인이 된다)
        verify.parent.mkdir(parents=True, exist_ok=True)
        verify.write_text('#!/usr/bin/env bash\necho "검증 passed(affected) — 하위"\n')
        verify.chmod(0o755)
        self.git(self.root, 'update-ref', 'refs/remotes/origin/develop', self.git(self.root, 'rev-parse', 'HEAD'))
        # api 는 바뀐 것이 없지만 브랜치 이슈 키가 어긋나 있다(바뀐 도메인만 검사하므로 잡히지 않아야 한다). app 은 push 하지 않은 포인터를 만든다
        self.git(self.root / DOMAINS[1], 'checkout', '-q', '-B', 'feat/KNOTS-99-other')
        self.commit_domain(DOMAINS[0], 'feature.md', push=False)
        self.git(self.root, 'add', DOMAINS[0])
        plan = run([sys.executable, str(self.root / 'scripts/verify-changed.py'), '--level', 'affected', '--plan'], self.root, self.env, check=False)
        self.assertEqual(0, plan.returncode, plan.stdout + plan.stderr)
        commands = [c for c in json.loads(plan.stdout)['commands'] if c['kind'] == 'gate']
        guards = [c for c in commands if any('check_submodules.py' in a for a in c['arguments'])]
        self.assertEqual(1, len(guards))
        self.assertIn(DOMAINS[0], guards[0]['arguments'])
        self.assertNotIn(DOMAINS[1], ' '.join(guards[0]['arguments']))
        # 계획의 명령을 그대로 부르면 app 의 앞선 포인터를 잡고, 계획에 없는 api 는 부르지 않았지만 부르면 브랜치 키 어긋남을 잡는다
        called = run(guards[0]['arguments'], guards[0]['cwd'], self.env, check=False)
        self.assertEqual(1, called.returncode, called.stdout + called.stderr)
        self.assertIn('[pointer]', called.stdout)
        self.assertIn('[branch]', self.check('--domain', DOMAINS[1]).stdout)


@unittest.skipUnless((REPO_SCRIPTS / 'run-guards.sh').is_file() and (REPO_SCRIPTS / 'guards/no-cross-domain-paths.sh').is_file(), '설치본의 가드에서 돈다')
class CrossDomainGuardTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='harness cross guard ')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve()
        (self.root / 'scripts').mkdir()
        shutil.copy2(REPO_SCRIPTS / 'run-guards.sh', self.root / 'scripts/run-guards.sh')
        (self.root / 'scripts/guards').mkdir()
        shutil.copy2(REPO_SCRIPTS / 'guards/no-cross-domain-paths.sh', self.root / 'scripts/guards/no-cross-domain-paths.sh')
        (self.root / 'tools/harness').mkdir(parents=True)
        (self.root / 'tools/harness/units.json').write_text(json.dumps({'units': [
            {'id': 'app', 'path': 'domains/app', 'packages': ['@acme/app-core']}, {'id': 'api', 'path': 'domains/api', 'packages': ['com.acme.api']}]}))
        for rel, text in {
            'domains/app/src/a.ts': "import x from '../../api/src/x'\nconst y = 1\n",
            'domains/app/src/b.ts': "const z = 'domains/api/openapi.yml'\n",
            'domains/api/src/Main.kt': 'import com.acme.app.Thing\n',
            'domains/api/src/ok.ts': "import { c } from '@acme/app-core'\n",
            'domains/app/src/own.ts': "import './local'\n",
        }.items():
            (self.root / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.root / rel).write_text(text)
        self.env = {**{k: v for k, v in os.environ.items() if k not in CLEARED}, 'PYTHONDONTWRITEBYTECODE': '1'}

    def guard(self):
        return run(['bash', str(self.root / 'scripts/guards/no-cross-domain-paths.sh')], self.root, self.env, check=False)

    def test_reports_paths_and_packages_of_other_domains_only(self):
        result = self.guard()
        self.assertEqual(1, result.returncode)
        lines = result.stdout.splitlines()
        self.assertIn("domains/app/src/a.ts:1: 다른 도메인(api)을 참조한다: ../api/", lines)
        self.assertIn("domains/app/src/b.ts:1: 다른 도메인(api)을 참조한다: domains/api/", lines)
        self.assertTrue(any(line.startswith('domains/api/src/ok.ts:1:') and '@acme/app-core' in line for line in lines))
        self.assertFalse(any('own.ts' in line or 'Main.kt' in line for line in lines))

    def test_warning_level_does_not_stop_the_gate_and_enforce_level_does(self):
        warn = run(['bash', str(self.root / 'scripts/run-guards.sh')], self.root, self.env, check=False)
        self.assertEqual(0, warn.returncode, warn.stdout + warn.stderr)
        self.assertIn('▲ [경고] no-cross-domain-paths', warn.stdout)
        enforced = run(['bash', str(self.root / 'scripts/run-guards.sh')], self.root, {**self.env, 'GUARD_ENFORCE': '1'}, check=False)
        self.assertEqual(1, enforced.returncode)

    def test_allow_file_needs_a_reason(self):
        allow = self.root / '.agents/guards/cross-domain-allow.txt'
        allow.parent.mkdir(parents=True)
        allow.write_text('# 예외\ndomains/app/src/a.ts  마이그레이션 문서가 경로를 설명한다\ndomains/app/src/b.ts\n')
        lines = self.guard().stdout.splitlines()
        self.assertFalse(any(line.startswith('domains/app/src/a.ts') for line in lines))
        self.assertTrue(any('b.ts' in line and '사유가 없다' in line for line in lines))
        self.assertTrue(any(line.startswith('domains/app/src/b.ts:1:') for line in lines))


if __name__ == '__main__':
    unittest.main()
