package im.demo.note.application.usecase

interface CreateNoteUseCase {
    fun create(title: String): String

    fun delete(noteId: String)
}
