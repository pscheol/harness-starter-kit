package im.demo.note.application.usecase

interface GetNoteUseCase {
    fun getNote(noteId: String): String

    fun recent(limit: Int): List<String>
}
