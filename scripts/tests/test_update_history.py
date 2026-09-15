import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('update_history', Path(__file__).parents[1] / 'update_history.py')
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)


class HistoryTests(unittest.TestCase):
    def test_success_error_and_rollback_survive_reread(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            operation = history.begin(root, 'update', 'v1.0.0', 'v1.1.0')
            history.change(root, operation, stage='download')
            history.change(root, operation, stage='backup', backup='backups/example')
            history.change(root, operation, stage='build')
            history.change(root, operation, status='failed', exit_code=7)
            history.change(root, operation, stage='rollback')
            self.assertIsNone(history.load(root)[0]['finished_at'])
            history.change(root, operation, status='rolled_back')
            result = history.load(root)[0]
            self.assertEqual(result['status'], 'rolled_back')
            self.assertEqual(result['exit_code'], 7)
            self.assertEqual([s['status'] for s in result['steps']], ['succeeded', 'succeeded', 'failed', 'succeeded'])
            self.assertEqual((root / 'history.json').stat().st_mode & 0o777, 0o644)
            next_id = history.begin(root, 'update', 'v1.0.0', 'v1.2.0')
            history.change(root, next_id, stage='health')
            history.change(root, next_id, status='succeeded')
            self.assertEqual(len(history.load(root)), 2)
            self.assertEqual(history.load(root)[0]['status'], 'succeeded')

    def test_interrupted_operation_and_bounded_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = history.begin(root, 'update', 'v1.0.0', 'v1.1.0')
            history.change(root, first, stage='build')
            history.begin(root, 'rollback', 'v1.0.0', 'v0.9.0')
            self.assertEqual(history.load(root)[1]['status'], 'interrupted')
            self.assertEqual(history.load(root)[1]['steps'][0]['status'], 'interrupted')
            for _ in range(100):
                history.begin(root, 'update', 'v1.0.0', 'v1.1.0')
            self.assertEqual(len(history.load(root)), 100)


class UpdateScriptTests(unittest.TestCase):
    def run_update(self, failure='', rollback_failure=False, script='update.sh'):
        import os
        import shutil
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scripts = root / 'scripts'
            scripts.mkdir()
            for name in ['update.sh', 'rollback.sh', 'update_history.py']:
                shutil.copy(Path(__file__).parents[1] / name, scripts / name)
            (root / '.git').mkdir()
            (root / '.previous-revision').write_text('b' * 40)
            (root / '.env').write_text('GITHUB_REPO=example/monitor\n')
            (scripts / 'backup.sh').write_text('test "${FAIL_STAGE:-}" != backup\n')
            fake = root / 'bin'
            fake.mkdir()
            stub = '''#!/usr/bin/env python3
import json, os, pathlib, sys
root=pathlib.Path(os.environ['TEST_PANEL'])
args=sys.argv[1:]; tool=pathlib.Path(sys.argv[0]).name
with (root/'calls').open('a') as out: out.write(json.dumps([tool,*args])+'\\n')
if tool=='git':
 if args[:2]==['rev-parse','HEAD']: print('a'*40)
 elif args and args[0]=='rev-parse': print('b'*40)
 elif args and args[0]=='describe': print('v0.1.5')
 elif args and args[0]=='checkout':
  # Prove the running updater survives replacement of its checkout files.
  (root/'scripts/update.sh').write_text('exit 99\\n')
  (root/'scripts/update_history.py').write_text('raise RuntimeError("replaced")\\n')
if tool=='docker':
 if args[:3]==['compose','images','-q']: print('sha256:old')
 elif args[:2]==['compose','build'] and os.environ['FAIL_STAGE']=='build': sys.exit(7)
 elif args[:2]==['compose','up'] and os.environ.get('FAIL_ROLLBACK')=='1': sys.exit(8)
'''
            for tool in ['git', 'docker', 'curl', 'flock']:
                path = fake / tool
                path.write_text(stub)
                path.chmod(0o755)
            env = dict(os.environ, PATH=str(fake) + os.pathsep + os.environ['PATH'], TEST_PANEL=str(root), VERSION='v0.1.6', FAIL_STAGE=failure, FAIL_ROLLBACK='1' if rollback_failure else '0')
            env.pop('STEALTHNET_PANEL_DIR', None)
            env.pop('STEALTHNET_UPDATE_STAGED', None)
            result = subprocess.run(['bash', str(scripts / script)], cwd=root, env=env, capture_output=True, text=True)
            rows = history.load(root / '.state/updates')
            return result, rows, (root / 'calls').read_text()

    def test_successful_update_records_every_stage_even_when_checkout_replaces_scripts(self):
        result, rows, _ = self.run_update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(rows[0]['status'], 'succeeded')
        self.assertEqual([s['name'] for s in rows[0]['steps']], ['download', 'backup', 'build', 'start', 'health'])
        self.assertTrue(all(s['status'] == 'succeeded' for s in rows[0]['steps']))

    def test_build_failure_restores_previous_app_and_records_error(self):
        result, rows, calls = self.run_update('build')
        self.assertEqual(result.returncode, 7)
        self.assertEqual(rows[0]['status'], 'rolled_back')
        self.assertEqual(rows[0]['exit_code'], 7)
        self.assertEqual(rows[0]['steps'][2]['status'], 'failed')
        self.assertIn('a' * 40, calls)

    def test_backup_failure_does_not_change_application(self):
        result, rows, calls = self.run_update('backup')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(rows[0]['status'], 'failed')
        self.assertNotIn('checkout', calls)

    def test_failed_restore_is_not_reported_as_success(self):
        result, rows, _ = self.run_update('build', True)
        self.assertEqual(result.returncode, 7)
        self.assertEqual(rows[0]['status'], 'rollback_failed')

    def test_manual_rollback_uses_same_persistent_history(self):
        result, rows, _ = self.run_update(script='rollback.sh')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(rows[0]['action'], 'rollback')
        self.assertEqual(rows[0]['status'], 'succeeded')
        self.assertEqual(rows[0]['steps'][0]['name'], 'rollback')
