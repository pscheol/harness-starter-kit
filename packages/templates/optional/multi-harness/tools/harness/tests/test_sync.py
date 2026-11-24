import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

SYNC = Path(__file__).resolve().parents[1] / 'sync.py'
# sync.py 는 단위 토큰(UNIT_ID · UNIT_TITLE …)만 채운다. 설치(kns:bootstrap)가 시험 파일의 토큰을 건드리지 않도록 이어 붙여 만든다.
UNIT_TITLE = '{{' + 'UNIT_TITLE}}'
UNIT_ID = '{{' + 'UNIT_ID}}'


class SyncTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='harness sync ')
        self.addCleanup(directory.cleanup)
        self.repo = Path(directory.name)
        self.tool = self.repo / 'tools/harness'
        self.shared = self.tool / 'shared'
        self.write(self.shared / '.agents/rules/writing-style.md', f'# 문체 — {UNIT_TITLE}\n')
        self.write(self.shared / '.agents/docs/_spec-templates/requirements/_template.md', '# {{FEATURE_NAME}}\n')
        self.write(self.shared / '.kiro/agents/__UNIT_ID__.json', '{"name": "' + UNIT_ID + '"}\n')
        self.write(self.shared / 'scripts/hooks/verify-gate.sh', f'#!/usr/bin/env bash\necho {UNIT_ID}\n', executable=True)
        self.write(self.shared / '__pycache__/ignored.pyc', 'x')
        self.registry({
            'units': [
                {'id': 'web', 'path': 'apps/web', 'title': 'Web', 'stack': 'web'},
                {'id': 'api', 'path': 'apps/api', 'title': 'API', 'stack': 'jvm',
                 'exclude': ['scripts/hooks/**']},
            ]
        })
        for unit in ('apps/web', 'apps/api'):
            (self.repo / unit).mkdir(parents=True)

    def write(self, path, text, executable=False):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        if executable:
            path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    def registry(self, data):
        (self.tool / 'units.json').write_text(json.dumps(data, ensure_ascii=False))

    def run_sync(self, *args, cwd=None):
        return subprocess.run(
            [sys.executable, str(SYNC), '--repo', str(self.repo), *args],
            cwd=cwd or self.repo / 'apps', capture_output=True, text=True,
        )

    def test_writes_rendered_shared_files_into_every_unit(self):
        result = self.run_sync()
        self.assertEqual(result.returncode, 0, result.stderr)
        web = self.repo / 'apps/web'
        self.assertEqual((web / '.agents/rules/writing-style.md').read_text(), '# 문체 — Web\n')
        self.assertEqual((web / '.kiro/agents/web.json').read_text(), '{"name": "web"}\n')
        self.assertFalse((web / '__pycache__').exists())

    def test_unknown_placeholders_survive_for_later_scaffolding(self):
        self.run_sync()
        template = self.repo / 'apps/web/.agents/docs/_spec-templates/requirements/_template.md'
        self.assertEqual(template.read_text(), '# {{FEATURE_NAME}}\n')

    def test_executable_bit_follows_the_source(self):
        self.run_sync()
        hook = self.repo / 'apps/web/scripts/hooks/verify-gate.sh'
        self.assertTrue(os.access(hook, os.X_OK))

    def test_excluded_paths_are_not_written(self):
        self.run_sync()
        self.assertFalse((self.repo / 'apps/api/scripts/hooks/verify-gate.sh').exists())
        self.assertTrue((self.repo / 'apps/api/.agents/rules/writing-style.md').is_file())

    def test_manifest_lists_shared_files(self):
        self.run_sync()
        manifest = json.loads((self.repo / 'apps/web/.agents/harness.json').read_text())
        self.assertEqual(manifest['unit'], 'web')
        self.assertEqual(manifest['title'], 'Web')
        self.assertIn('.kiro/agents/web.json', manifest['shared'])
        self.assertNotIn('scripts/hooks/verify-gate.sh', json.loads(
            (self.repo / 'apps/api/.agents/harness.json').read_text())['shared'])

    def test_check_passes_after_sync(self):
        self.run_sync()
        result = self.run_sync('--check')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_check_reports_modified_shared_file(self):
        self.run_sync()
        (self.repo / 'apps/web/.agents/rules/writing-style.md').write_text('# 로컬 수정\n')
        result = self.run_sync('--check')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('apps/web/.agents/rules/writing-style.md', result.stdout + result.stderr)

    def test_check_reports_missing_shared_file(self):
        self.run_sync()
        (self.repo / 'apps/web/.agents/rules/writing-style.md').unlink()
        result = self.run_sync('--check')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('missing', result.stdout + result.stderr)

    def test_check_does_not_write(self):
        result = self.run_sync('--check')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.repo / 'apps/web/.agents').exists())

    def test_removed_source_is_pruned_from_units(self):
        self.run_sync()
        (self.shared / '.agents/rules/writing-style.md').unlink()
        check = self.run_sync('--check')
        self.assertNotEqual(check.returncode, 0)
        self.assertIn('stale', check.stdout + check.stderr)
        self.assertEqual(self.run_sync().returncode, 0)
        self.assertFalse((self.repo / 'apps/web/.agents/rules/writing-style.md').exists())

    def test_unit_owned_files_are_never_touched(self):
        owned = self.repo / 'apps/web/.agents/rules/structure.md'
        self.write(owned, '# 단위 고유\n')
        self.run_sync()
        self.assertEqual(owned.read_text(), '# 단위 고유\n')
        self.assertEqual(self.run_sync('--check').returncode, 0)

    def test_unit_selection_limits_the_run(self):
        result = self.run_sync('--unit', 'api')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.repo / 'apps/web/.agents').exists())
        self.assertTrue((self.repo / 'apps/api/.agents/rules/writing-style.md').is_file())

    def test_unknown_unit_is_rejected(self):
        result = self.run_sync('--unit', 'nope')
        self.assertEqual(result.returncode, 2)

    def test_unit_path_cannot_escape_the_repository(self):
        self.registry({'units': [{'id': 'bad', 'path': '../outside', 'title': 'Bad', 'stack': 'web'}]})
        result = self.run_sync()
        self.assertEqual(result.returncode, 2)
        self.assertFalse((self.repo.parent / 'outside').exists())

    def write_manifest(self, unit, shared):
        path = self.repo / unit / '.agents/harness.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({'unit': 'web', 'shared': shared}))

    def test_manifest_entries_cannot_escape_the_unit(self):
        victim = self.repo.parent / f'{self.repo.name}-victim.txt'
        victim.write_text('keep')
        self.addCleanup(lambda: victim.exists() and victim.unlink())
        self.write_manifest('apps/web', [f'../../../{victim.name}', str(victim)])
        result = self.run_sync()
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertTrue(victim.exists())
        self.assertNotEqual(self.run_sync('--check').returncode, 0)

    def test_manifest_shared_must_be_a_list(self):
        self.write_manifest('apps/web', 'abc')
        self.assertEqual(self.run_sync().returncode, 2)

    def test_root_manifest_cannot_prune_inside_another_unit(self):
        self.registry({'units': [
            {'id': 'root', 'path': '.', 'title': 'Root', 'stack': 'monorepo'},
            {'id': 'web', 'path': 'apps/web', 'title': 'Web', 'stack': 'web'},
        ]})
        owned = self.repo / 'apps/web/notes.md'
        self.write(owned, '단위 파일\n')
        self.write_manifest('.', ['apps/web/notes.md'])
        result = self.run_sync()
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertTrue(owned.exists())

    def test_excluding_a_shared_file_keeps_the_unit_copy(self):
        self.run_sync()
        settings = self.repo / 'apps/web/scripts/hooks/verify-gate.sh'
        settings.write_text('#!/usr/bin/env bash\necho 단위가 고친 게이트\n')
        self.registry({'units': [
            {'id': 'web', 'path': 'apps/web', 'title': 'Web', 'stack': 'web', 'exclude': ['scripts/hooks/**']},
            {'id': 'api', 'path': 'apps/api', 'title': 'API', 'stack': 'jvm', 'exclude': ['scripts/hooks/**']},
        ]})
        self.assertEqual(self.run_sync('--check').returncode, 1)
        self.assertEqual(self.run_sync().returncode, 0)
        self.assertEqual(settings.read_text(), '#!/usr/bin/env bash\necho 단위가 고친 게이트\n')
        manifest = json.loads((self.repo / 'apps/web/.agents/harness.json').read_text())
        self.assertNotIn('scripts/hooks/verify-gate.sh', manifest['shared'])
        self.assertEqual(self.run_sync('--check').returncode, 0)

    def test_new_shared_file_does_not_overwrite_a_unit_owned_file(self):
        self.run_sync()
        owned = self.repo / 'apps/web/.agents/rules/structure.md'
        self.write(owned, '# 단위 고유 구조\n')
        self.write(self.shared / '.agents/rules/structure.md', '# 공통 구조\n')
        check = self.run_sync('--check')
        self.assertNotEqual(check.returncode, 0)
        self.assertIn('collision', check.stdout + check.stderr)
        result = self.run_sync()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(owned.read_text(), '# 단위 고유 구조\n')
        self.assertEqual(self.run_sync('--adopt').returncode, 0)
        self.assertEqual(owned.read_text(), '# 공통 구조\n')

    def test_identical_existing_file_is_adopted_without_flag(self):
        same = self.repo / 'apps/web/.agents/rules/writing-style.md'
        self.write(same, '# 문체 — Web\n')
        self.assertEqual(self.run_sync().returncode, 0, self.run_sync('--check').stdout)

    def test_executable_bit_is_removed_when_the_source_drops_it(self):
        self.run_sync()
        source = self.shared / 'scripts/hooks/verify-gate.sh'
        source.chmod(0o644)
        check = self.run_sync('--check')
        self.assertNotEqual(check.returncode, 0)
        self.assertIn('mode', check.stdout + check.stderr)
        self.run_sync()
        self.assertFalse(os.access(self.repo / 'apps/web/scripts/hooks/verify-gate.sh', os.X_OK))

    def test_missing_unit_directory_fails(self):
        shutil.rmtree(self.repo / 'apps/web')
        result = self.run_sync()
        self.assertEqual(result.returncode, 2)
        self.assertIn('apps/web', result.stderr)


if __name__ == '__main__':
    unittest.main()
