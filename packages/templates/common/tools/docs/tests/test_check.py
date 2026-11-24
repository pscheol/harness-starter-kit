import json
import shutil
import tempfile
import unittest
from pathlib import Path

from docskit import config as config_module
from docskit import fingerprint, site
from docskit.extract import schema as schema_extract

FIXTURES = Path(__file__).parent / "fixtures"


def fixture_site() -> tuple[Path, Path, config_module.Config]:
    """작은 가짜 리포(코틀린·OpenAPI·마이그레이션·사이트)를 만들고 한 번 생성한다. (임시 폴더, 사이트, 설정)."""
    tmp = Path(tempfile.mkdtemp(prefix="docs-check-"))
    for name in ("kotlin", "openapi", "migrations"):
        shutil.copytree(FIXTURES / name, tmp / name)
    site_dir = tmp / "site"
    shutil.copytree(FIXTURES / "site", site_dir)
    vendor = site_dir / "assets" / "vendor"
    (vendor / "mermaid").mkdir(parents=True)
    (vendor / "scalar").mkdir(parents=True)
    (vendor / "mermaid" / "mermaid.min.js").write_text("/* stub */")
    (vendor / "scalar" / "standalone.js").write_text("/* stub */")
    spec = json.loads((tmp / "openapi" / "demo.json").read_text(encoding="utf-8"))
    spec["x-docs-source"] = {"path": "openapi/demo.json", "sha256": fingerprint.file_sha256(tmp / "openapi" / "demo.json")}
    (site_dir / "_data" / "openapi").mkdir(parents=True)
    (site_dir / "_data" / "openapi" / "demo-server--api.json").write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
    raw = json.loads((FIXTURES / "schema-demo.json").read_text(encoding="utf-8"))
    data = schema_extract.normalize(raw, "demo", fingerprint.migration_sources(tmp, ["migrations"]))
    (site_dir / "_data" / "schema").mkdir(parents=True)
    (site_dir / "_data" / "schema" / "demo.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    config = config_module.load(tmp, site_dir)
    site.build(config)
    return tmp, site_dir, config


class CheckTest(unittest.TestCase):
    """작은 가짜 리포에서 생성 → 검사 통과를 만든 뒤, 하나씩 깨뜨려 검사가 잡는지 본다."""

    def setUp(self):
        self.tmp, self.site, self.config = fixture_site()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def problems(self):
        return site.check(self.config)

    def test_clean_build_passes(self):
        self.assertEqual(self.problems(), [])

    def test_build_is_byte_stable(self):
        before = {p: p.read_bytes() for p in self.site.rglob("*.html")}
        site.build(self.config)
        after = {p: p.read_bytes() for p in self.site.rglob("*.html")}
        self.assertEqual(before, after)

    def test_unassigned_operation_and_table(self):
        catalog = self.site / "_src" / "catalog.json"
        data = json.loads(catalog.read_text(encoding="utf-8"))
        data["features"][0]["match"]["demo-server"]["packages"] = ["im.demo.common.**"]
        catalog.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        found = "\n".join(self.problems())
        self.assertIn("미배정 operation demo-server GET /api/v1/notes", found)
        self.assertIn("미배정 테이블 note.nte_note", found)

    def test_duplicate_assignment(self):
        catalog = self.site / "_src" / "catalog.json"
        data = json.loads(catalog.read_text(encoding="utf-8"))
        twin = json.loads(json.dumps(data["features"][0]))
        twin["id"] = "F-NOTE-02"
        data["features"].append(twin)
        catalog.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        self.assertTrue(any(p.startswith("중복 배정 operation") for p in self.problems()))

    def test_missing_section_and_todo(self):
        doc = self.site / "_src" / "features" / "F-NOTE-01.md"
        text = doc.read_text(encoding="utf-8").replace("## 변경 영향", "## 기타").replace("상태 전이 설명.", "TODO-DOC")
        doc.write_text(text, encoding="utf-8")
        found = "\n".join(self.problems())
        self.assertIn("빠진 절 변경 영향", found)
        self.assertIn("TODO-DOC 1곳", found)

    def test_policy_table_header(self):
        doc = self.site / "_src" / "features" / "F-NOTE-01.md"
        doc.write_text(doc.read_text(encoding="utf-8").replace("| ID | 규칙 | 강제 위치 |", "| 번호 | 규칙 | 위치 |"), encoding="utf-8")
        self.assertTrue(any("정책 표 머리" in p for p in self.problems()))

    def test_openapi_source_changed(self):
        source = self.tmp / "openapi" / "demo.json"
        source.write_text(source.read_text(encoding="utf-8").replace("노트 목록", "노트 목록2"), encoding="utf-8")
        self.assertTrue(any(p.startswith("OpenAPI 원본이 바뀌었다") for p in self.problems()))

    def test_migration_added(self):
        (self.tmp / "migrations" / "V2__more.sql").write_text("SELECT 1;")
        self.assertTrue(any(p.startswith("마이그레이션이 바뀌었다 demo") for p in self.problems()))

    def test_generated_output_drift_and_stale_file(self):
        (self.site / "features" / "F-NOTE-01.html").write_text("손으로 고침", encoding="utf-8")
        (self.site / "features" / "F-OLD-01.html").write_text("옛 기능", encoding="utf-8")
        found = "\n".join(self.problems())
        self.assertIn("생성 결과가 커밋본과 다르다", found)
        self.assertIn("지워야 할 생성물 features/F-OLD-01.html", found)

    def test_check_writes_nothing(self):
        before = {p: p.stat().st_mtime_ns for p in self.site.rglob("*") if p.is_file()}
        (self.site / "features" / "F-NOTE-01.html").write_text("손으로 고침", encoding="utf-8")
        before[self.site / "features" / "F-NOTE-01.html"] = (self.site / "features" / "F-NOTE-01.html").stat().st_mtime_ns
        self.problems()
        after = {p: p.stat().st_mtime_ns for p in self.site.rglob("*") if p.is_file()}
        self.assertEqual(before, after)

    def test_include_pulls_source_section_and_relinks(self):
        (self.tmp / "ARCH.md").write_text("# 아키텍처\n\n## 1. 경계\n\n경계 설명 [규칙](rules/a.md)\n\n## 2. 다른 절\n\n빼야 할 글\n", encoding="utf-8")
        (self.tmp / "rules").mkdir()
        (self.tmp / "rules" / "a.md").write_text("# a\n", encoding="utf-8")
        stages = self.site / "_src" / "stages"
        stages.mkdir(parents=True, exist_ok=True)
        (stages / "05-시스템-설계.md").write_text("# 시스템 설계\n\n<!-- include: ARCH.md#1. 경계 -->\n", encoding="utf-8")
        site.build(self.config)
        html = (self.site / "05-시스템-설계.html").read_text(encoding="utf-8")
        self.assertIn("경계 설명", html)
        self.assertNotIn("빼야 할 글", html)
        self.assertIn('href="../rules/a.md"', html)
        self.assertEqual(self.problems(), [])

    def test_missing_vendor_scripts_are_a_warning_not_a_failure(self):
        shutil.rmtree(self.site / "assets" / "vendor")
        self.assertEqual(self.problems(), [])
        self.assertIn("refresh vendor", site.vendor_warning(self.config))

    def test_table_comment_is_escaped_in_db_page(self):
        schema = self.site / "_data" / "schema" / "demo.json"
        data = json.loads(schema.read_text(encoding="utf-8"))
        data["tables"][0]["comment"] = "참조 {{context:<id>}} <img src=x onerror=alert(1)>"
        schema.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        site.build(self.config)
        page = (self.site / "08-DB-설계.html").read_text(encoding="utf-8")
        self.assertNotIn("<img src=x", page)
        self.assertIn("{{context:&lt;id&gt;}}", page)

    def test_api_page_json_cannot_open_html_comment_or_close_script(self):
        snapshot = self.site / "_data" / "openapi" / "demo-server--api.json"
        spec = json.loads(snapshot.read_text(encoding="utf-8"))
        spec.setdefault("info", {})["description"] = "주의 <!-- 열림 </script><script>alert(1)</script>"
        snapshot.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
        site.build(self.config)
        page = next((self.site / "api").glob("*.html")).read_text(encoding="utf-8")
        payload = page.split('id="spec">', 1)[1].split("</script>", 1)[0]
        self.assertNotIn("<", payload)
        self.assertIn("\\u003c!-- 열림", payload)

    def test_feature_page_carries_generated_facts(self):
        html = (self.site / "features" / "F-NOTE-01.html").read_text(encoding="utf-8")
        self.assertIn("note.nte_note", html)
        self.assertIn("pk_nte_note", html)
        self.assertIn("rls_nte_note_workspace", html)
        self.assertIn("NoteService.visible", html)
        self.assertIn("note-list", html)
        api = (self.site / "api" / "demo-server.html").read_text(encoding="utf-8")
        self.assertIn("F-NOTE-01 노트", api)
        self.assertIn("sequenceDiagram", api)
        self.assertNotIn("</script><", api.split('id="spec">', 1)[1].split("</script>", 1)[0])


if __name__ == "__main__":
    unittest.main()
