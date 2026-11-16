import unittest
from pathlib import Path

from docskit.extract import kotlin

FIXTURE = Path(__file__).parent / "fixtures" / "kotlin"
TABLES = {"note.nte_note", "note.nte_audit"}


class MaskTest(unittest.TestCase):
    def test_hides_comments_and_string_contents_but_keeps_positions(self):
        text = 'val a = "x } ${b.c()} y" // }\nfun f() {}\n/* } /* } */ } */'
        masked, strings = kotlin.mask(text)
        self.assertEqual(len(masked), len(text))
        self.assertEqual(masked.count("}"), 1)
        self.assertEqual(text[strings[0][0] : strings[0][1]], "x } ${b.c()} y")

    def test_raw_string_with_quotes(self):
        text = 'val s = """a "b" } c"""\nval t = 1'
        masked, strings = kotlin.mask(text)
        self.assertNotIn("}", masked)
        self.assertEqual(text[strings[0][0] : strings[0][1]], 'a "b" } c')


class IndexTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = kotlin.index_sources(FIXTURE)

    def test_entities_and_repositories(self):
        self.assertEqual(self.index.entities["im.demo.note.infra.persistence.NoteJpaEntity"], "note.nte_note")
        self.assertEqual(
            self.index.repositories["im.demo.note.infra.persistence.NoteJpaRepository"],
            "im.demo.note.infra.persistence.NoteJpaEntity",
        )

    def test_constructor_fields_and_supertypes(self):
        service = self.index.classes["im.demo.note.application.service.NoteService"]
        self.assertEqual(service.fields["notes"], "im.demo.note.application.output.NoteRepositoryPort")
        self.assertEqual(
            sorted(b for b, _ in service.supertypes),
            ["im.demo.note.application.usecase.CreateNoteUseCase", "im.demo.note.application.usecase.GetNoteUseCase"],
        )
        self.assertEqual(sorted(service.methods), ["create", "delete", "getNote", "helperA", "helperB", "recent", "visible"])

    def test_method_after_tricky_string_is_found(self):
        controller = self.index.classes["im.demo.note.primary.web.NoteController"]
        self.assertEqual(sorted(controller.methods), ["create", "delete", "getNote", "list"])

    def test_consts(self):
        self.assertEqual(self.index.consts["CacheNames.NOTE_LIST"], "note-list")

    def test_endpoints(self):
        found = {(e.method, e.path, e.function) for e in kotlin.endpoints(self.index)}
        self.assertEqual(
            found,
            {
                ("GET", "/api/v1/notes/{noteId}", "getNote"),
                ("GET", "/api/v1/notes", "list"),
                ("POST", "/api/v1/notes", "create"),
                ("DELETE", "/api/v1/notes/{id}", "delete"),
            },
        )


class TraceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = kotlin.index_sources(FIXTURE)
        cls.controller = "im.demo.note.primary.web.NoteController"

    def trace(self, method):
        return kotlin.trace(self.index, self.controller, method, TABLES)

    def test_read_goes_through_interface_private_helper_and_jdsl(self):
        result = self.trace("getNote")
        self.assertEqual(result.tables, {"note.nte_note": {"R"}})
        self.assertIn("NoteService.visible", result.visited)
        self.assertIn(("NoteService", "NotePersistenceAdapter", "find"), result.calls)

    def test_write_through_mapper_object_and_native_sql_in_one_of_two_impls(self):
        result = self.trace("create")
        self.assertEqual(result.tables["note.nte_note"], {"W"})
        self.assertEqual(result.tables["note.nte_audit"], {"W"})
        self.assertEqual(result.clients, ["PlatformClient.checkQuota"])

    def test_jdsl_update_is_write_and_cycle_terminates(self):
        result = self.trace("delete")
        self.assertIn("W", result.tables["note.nte_note"])
        self.assertIn("NoteService.helperB", result.visited)

    def test_cache_annotation_on_interface_method(self):
        result = self.trace("list")
        names = {(c.name, c.operation) for c in result.caches}
        self.assertIn(("note-list", "Cacheable"), names)
        self.assertEqual(result.tables, {"note.nte_note": {"R"}})


if __name__ == "__main__":
    unittest.main()
