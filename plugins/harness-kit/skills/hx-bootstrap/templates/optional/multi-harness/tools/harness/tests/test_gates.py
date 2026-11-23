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


if __name__ == '__main__':
    unittest.main()
