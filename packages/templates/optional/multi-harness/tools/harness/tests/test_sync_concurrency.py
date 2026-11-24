import hashlib
import importlib.util
import json
from pathlib import Path
import stat
import subprocess
import sys
import unittest
from unittest import mock

try:
    from . import test_sync
except ImportError:
    import test_sync


class ConcurrentSyncTest(unittest.TestCase):
    setUp = test_sync.SyncTest.setUp
    write = test_sync.SyncTest.write
    registry = test_sync.SyncTest.registry
    run_sync = test_sync.SyncTest.run_sync
    write_manifest = test_sync.SyncTest.write_manifest

    def state(self):
        return {
            path.relative_to(self.repo).as_posix(): (
                hashlib.sha256(path.read_bytes()).hexdigest(), stat.S_IMODE(path.stat().st_mode)
            )
            for path in self.repo.rglob('*') if path.is_file() and not path.is_symlink()
        }

    def baseline(self):
        snapshot = self.repo / 'baseline.json'
        snapshot.write_text(json.dumps({
            relative: {'sha256': digest, 'mode': mode}
            for relative, (digest, mode) in self.state().items()
        }))
        return snapshot

    def target(self, relative='.agents/rules/writing-style.md'):
        return self.repo / 'apps/web' / relative

    def assert_refused_without_changes(self, *args):
        before = self.state()
        result = self.run_sync(*args)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.state(), before)
        return result

    def test_snapshot_saves_all_deployment_targets_without_syncing(self):
        snapshot = self.repo / 'snapshot.json'
        result = self.run_sync('--snapshot', str(snapshot))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        states = json.loads(snapshot.read_text())
        self.assertIn('apps/web/.agents/harness.json', states)
        self.assertIn('apps/web/.agents/rules/writing-style.md', states)
        self.assertIsNone(states['apps/web/.agents/rules/writing-style.md'])
        self.assertFalse(self.target().exists())

    def test_baseline_allows_source_update_from_unchanged_targets(self):
        self.assertEqual(self.run_sync().returncode, 0)
        snapshot = self.baseline()
        self.write(self.shared / '.agents/rules/writing-style.md', '# 개선 — ' + '{{' + 'UNIT_TITLE}}' + '\n')
        result = self.run_sync('--baseline', str(snapshot))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.target().read_text(), '# 개선 — Web\n')
        self.assertEqual(self.run_sync('--check').returncode, 0)

    def test_baseline_refuses_a_concurrent_content_change_before_any_write(self):
        self.run_sync()
        snapshot = self.baseline()
        self.target().write_text('# 다른 세션 수정\n')
        self.write(self.shared / '.agents/rules/writing-style.md', '# 개선\n')
        result = self.assert_refused_without_changes('--baseline', str(snapshot))
        self.assertIn('changed since snapshot', result.stdout + result.stderr)

    def test_baseline_refuses_a_concurrent_permission_change(self):
        self.run_sync()
        snapshot = self.baseline()
        self.target().chmod(0o600)
        self.assert_refused_without_changes('--baseline', str(snapshot))

    def test_baseline_refuses_a_concurrent_manifest_change(self):
        self.run_sync()
        snapshot = self.baseline()
        manifest = self.target('.agents/harness.json')
        manifest.write_text(manifest.read_text() + '\n')
        self.assert_refused_without_changes('--baseline', str(snapshot))

    def test_baseline_refuses_a_concurrent_deletion(self):
        self.run_sync()
        snapshot = self.baseline()
        self.target().unlink()
        self.assert_refused_without_changes('--baseline', str(snapshot))

    def test_baseline_refuses_changed_stale_files_before_pruning(self):
        self.run_sync()
        snapshot = self.baseline()
        self.target().write_text('# 다른 세션 수정\n')
        (self.shared / '.agents/rules/writing-style.md').unlink()
        self.assert_refused_without_changes('--baseline', str(snapshot))

    def test_baseline_refuses_existing_paths_missing_from_snapshot_even_with_adopt(self):
        self.run_sync()
        snapshot = self.baseline()
        self.write(self.shared / '.agents/rules/new.md', '# 공통\n')
        self.write(self.target('.agents/rules/new.md'), '# 다른 세션 신규\n')
        self.assert_refused_without_changes('--baseline', str(snapshot), '--adopt')

    def test_baseline_rejects_invalid_fingerprints(self):
        self.run_sync()
        snapshot = self.repo / 'invalid.json'
        snapshot.write_text(json.dumps({'apps/web/.agents/harness.json': {'sha256': 'bad', 'mode': 420}}))
        result = self.assert_refused_without_changes('--baseline', str(snapshot))
        self.assertEqual(result.returncode, 2)

    def test_default_sync_refuses_modified_managed_files_even_with_adopt(self):
        self.run_sync()
        self.target().write_text('# 다른 세션 수정\n')
        result = self.assert_refused_without_changes('--adopt')
        self.assertIn('local change', result.stdout + result.stderr)

    def test_default_sync_allows_source_updates_with_recorded_deployment_hashes(self):
        self.run_sync()
        self.write(self.shared / '.agents/rules/writing-style.md', '# 개선\n')
        result = self.run_sync()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.target().read_text(), '# 개선\n')

    def test_default_sync_refuses_modified_stale_files(self):
        self.run_sync()
        self.target().write_text('# 다른 세션 수정\n')
        (self.shared / '.agents/rules/writing-style.md').unlink()
        self.assert_refused_without_changes()

    def test_default_sync_refuses_permission_changes_to_managed_files(self):
        self.run_sync()
        self.target().chmod(0o600)
        self.assert_refused_without_changes()

    def test_legacy_manifest_requires_baseline_for_a_changed_managed_target(self):
        self.run_sync()
        manifest = self.target('.agents/harness.json')
        data = json.loads(manifest.read_text())
        data.pop('deployed', None)
        manifest.write_text(json.dumps(data))
        snapshot = self.baseline()
        self.write(self.shared / '.agents/rules/writing-style.md', '# 개선\n')
        self.assert_refused_without_changes()
        result = self.run_sync('--baseline', str(snapshot))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_symlink_target_is_rejected_even_when_adoption_is_requested(self):
        victim = self.repo / 'victim.md'
        self.write(victim, '# 유지\n')
        self.target().parent.mkdir(parents=True)
        self.target().symlink_to(victim)
        result = self.assert_refused_without_changes('--adopt')
        self.assertIn('symlink', result.stdout + result.stderr)
        self.assertTrue(self.target().is_symlink())

    def test_symlink_parent_inside_the_repository_is_rejected(self):
        victim = self.repo / 'victim-directory'
        victim.mkdir()
        (self.repo / 'apps/web/.agents').symlink_to(victim, target_is_directory=True)
        result = self.assert_refused_without_changes('--adopt')
        self.assertIn('symlink', result.stdout + result.stderr)
        self.assertEqual(list(victim.iterdir()), [])

    def test_directory_at_target_is_rejected_before_any_write(self):
        self.target().mkdir(parents=True)
        self.assert_refused_without_changes()

    def test_shared_source_symlinks_are_rejected(self):
        victim = self.repo / 'source-victim.md'
        self.write(victim, '# 외부 원본\n')
        (self.shared / 'symlink.md').symlink_to(victim)
        result = self.assert_refused_without_changes()
        self.assertIn('symlink', result.stdout + result.stderr)

    def sync_module(self):
        sys.path.insert(0, str(test_sync.SYNC.parent))
        self.addCleanup(lambda: sys.path.remove(str(test_sync.SYNC.parent)))
        specification = importlib.util.spec_from_file_location('harness_sync_under_test', test_sync.SYNC)
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)
        return module

    def test_check_does_not_create_a_lock_or_modify_any_file(self):
        self.sync_module()
        import sync_safety
        lock = sync_safety.lock_path(self.repo)
        self.assertFalse(lock.exists())
        before = self.state()
        self.run_sync('--check')
        self.assertEqual(self.state(), before)
        self.assertFalse(lock.exists())

    def test_check_does_not_create_python_bytecode_inside_the_repository(self):
        self.write(self.tool / 'sync.py', test_sync.SYNC.read_text())
        self.write(self.tool / 'sync_safety.py', (test_sync.SYNC.parent / 'sync_safety.py').read_text())
        before = {path.relative_to(self.repo).as_posix() for path in self.repo.rglob('*')}
        result = subprocess.run(
            [sys.executable, str(self.tool / 'sync.py'), '--repo', str(self.repo), '--check'],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual({path.relative_to(self.repo).as_posix() for path in self.repo.rglob('*')}, before)

    def test_a_second_deployment_is_refused_while_the_first_has_the_lock(self):
        self.sync_module()
        import sync_safety
        with sync_safety.deployment_lock(self.repo):
            result = self.assert_refused_without_changes()
        self.assertIn('another harness sync', result.stdout + result.stderr)

    def test_atomic_writer_rechecks_changes_after_staging_and_leaves_no_temporary_file(self):
        self.sync_module()
        import sync_safety
        self.write(self.target(), '# 이전 배포\n')
        relative = self.target().relative_to(self.repo).as_posix()
        expected = sync_safety.file_state(self.repo, relative)
        original_check = sync_safety.assert_unchanged

        def concurrent_change(*args):
            self.target().write_text('# 다른 세션 수정\n')
            return original_check(*args)

        with mock.patch.object(sync_safety, 'assert_unchanged', side_effect=concurrent_change):
            with self.assertRaisesRegex(sync_safety.SafetyError, 'changed since snapshot'):
                sync_safety.atomic_write(self.repo, relative, '# 신규 배포\n', 0o644, expected)
        self.assertEqual(self.target().read_text(), '# 다른 세션 수정\n')
        self.assertEqual(list(self.target().parent.glob('.harness-sync-*.tmp')), [])

    def test_atomic_writer_preserves_previous_bytes_until_replace(self):
        self.sync_module()
        import sync_safety
        self.write(self.target(), '# 이전 배포\n')
        relative = self.target().relative_to(self.repo).as_posix()
        expected = sync_safety.file_state(self.repo, relative)
        original_replace = sync_safety.os.replace

        def inspect_before_replace(*args, **kwargs):
            self.assertEqual(self.target().read_text(), '# 이전 배포\n')
            return original_replace(*args, **kwargs)

        with mock.patch.object(sync_safety.os, 'replace', side_effect=inspect_before_replace) as replacement:
            sync_safety.atomic_write(self.repo, relative, '# 신규 배포\n', 0o600, expected)
        self.assertEqual(replacement.call_count, 1)
        self.assertEqual(self.target().read_text(), '# 신규 배포\n')
        self.assertEqual(stat.S_IMODE(self.target().stat().st_mode), 0o600)

    def test_atomic_pruning_rechecks_the_original_file(self):
        self.sync_module()
        import sync_safety
        self.write(self.target(), '# 이전 배포\n')
        relative = self.target().relative_to(self.repo).as_posix()
        expected = sync_safety.file_state(self.repo, relative)
        self.target().write_text('# 다른 세션 수정\n')
        with self.assertRaisesRegex(sync_safety.SafetyError, 'changed since snapshot'):
            sync_safety.safe_unlink(self.repo, relative, expected)
        self.assertEqual(self.target().read_text(), '# 다른 세션 수정\n')

    def test_snapshot_cannot_overwrite_a_deployment_target(self):
        self.run_sync()
        self.assert_refused_without_changes('--snapshot', str(self.target()))

    def test_unit_root_symlink_is_rejected(self):
        original = self.repo / 'apps/web'
        original.rename(self.repo / 'apps/web-original')
        original.symlink_to(self.repo / 'apps/web-original', target_is_directory=True)
        self.assert_refused_without_changes()

    def test_reserved_manifest_cannot_be_a_shared_source(self):
        self.write(self.shared / '.agents/harness.json', '{}\n')
        self.assert_refused_without_changes()

    def test_source_modification_during_planning_prevents_any_deployment(self):
        module = self.sync_module()
        original_plan = module.planned_files
        target_source = self.shared / '.agents/rules/writing-style.md'

        def change_source(*args):
            planned = original_plan(*args)
            target_source.write_text('# 원본 동시 수정\n')
            return planned

        arguments = module.argparse.Namespace(
            repo=self.repo, unit=[], check=False, snapshot=None, baseline=None, adopt=False
        )
        with mock.patch.object(module, 'planned_files', side_effect=change_source):
            self.assertNotEqual(module.run(arguments), 0)
        self.assertFalse(self.target().exists())
        self.assertFalse((self.repo / 'apps/api/.agents').exists())


if __name__ == '__main__':
    unittest.main()
