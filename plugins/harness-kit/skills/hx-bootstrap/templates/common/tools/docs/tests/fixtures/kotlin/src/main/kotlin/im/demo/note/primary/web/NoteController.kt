package im.demo.note.primary.web

import im.demo.note.application.usecase.CreateNoteUseCase
import im.demo.note.application.usecase.GetNoteUseCase
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** 노트 API. 주석 안의 } 괄호는 본문 자르기에 영향이 없어야 한다. */
@RestController
@RequestMapping("/api/v1/notes")
class NoteController(
    private val reader: GetNoteUseCase,
    private val writer: CreateNoteUseCase,
) {
    @GetMapping("/{noteId}")
    fun getNote(
        @PathVariable noteId: String,
    ): String {
        val label = "brace } in string ${noteId.length} {"
        return reader.getNote(noteId) + label
    }

    @GetMapping
    fun list(): List<String> = reader.recent(10)

    @PostMapping
    fun create(): String = writer.create("title")

    @DeleteMapping(value = ["/{id}"])
    fun delete(
        @PathVariable id: String,
    ) {
        writer.delete(id)
    }
}
