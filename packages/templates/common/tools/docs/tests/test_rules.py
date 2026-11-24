"""changed 게이트 규칙(`.agents/verify-checks.json`)이 생성기 입력을 덮는지 검사가 확인한다.

덮지 않은 입력만 바꾼 커밋은 changed 를 통과하고, 다음 전체 검사에서 "생성 결과가 커밋본과 다르다"로 실패한다.
"""

import json
import shutil
import unittest

from docskit import site
from tests.test_check import fixture_site


class ChangedRuleCoverageTest(unittest.TestCase):
    def setUp(self):
        self.tmp, self.site, self.config = fixture_site()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.rules = self.tmp / ".agents" / "verify-checks.json"

    def write_rules(self, paths, command=("python3", "tools/docs/feature_docs.py", "check")):
        self.rules.parent.mkdir(parents=True, exist_ok=True)
        self.rules.write_text(json.dumps({"checks": [{"id": "feature-docs", "paths": paths, "command": list(command)}]}), encoding="utf-8")

    def test_inputs_cover_sources_snapshots_and_manuscripts(self):
        inputs = site.generator_inputs(self.config)
        self.assertIn("openapi/demo.json", inputs)
        self.assertIn("migrations/V1__note.sql", inputs)
        self.assertTrue(any(path.startswith("kotlin/") and path.endswith(".kt") for path in inputs))
        self.assertTrue(any(path.startswith("site/_src/") for path in inputs))

    def test_rule_that_misses_an_input_is_reported(self):
        self.write_rules(["site/*", "openapi/*", "migrations/*"])
        found = "\n".join(site.check(self.config))
        self.assertIn("changed 문서 검사 규칙이 생성기 입력", found)
        self.assertIn("kotlin/", found)

    def test_rule_that_covers_every_input_passes(self):
        self.write_rules(["site/*", "openapi/*", "migrations/*", "kotlin/*"])
        self.assertEqual(site.check(self.config), [])

    def test_assets_only_rule_does_not_count_as_the_docs_rule(self):
        self.write_rules(["*"], command=("python3", "tools/docs/feature_docs.py", "check", "--assets"))
        self.assertIn("changed 규칙에 기능 문서 검사가 없다", "\n".join(site.check(self.config)))

    def test_without_rules_file_nothing_is_checked(self):
        self.assertEqual(site.check(self.config), [])


if __name__ == "__main__":
    unittest.main()
