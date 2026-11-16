package im.demo.note.application.service

import im.demo.note.application.output.AuditPort
import im.demo.note.application.output.NoteRepositoryPort
import im.demo.note.application.usecase.CreateNoteUseCase
import im.demo.note.application.usecase.GetNoteUseCase
import im.demo.note.infra.client.PlatformClient
import org.springframework.stereotype.Service

@Service
class NoteService(
    private val notes: NoteRepositoryPort,
    private val audit: AuditPort,
    private val platform: PlatformClient,
) : GetNoteUseCase,
    CreateNoteUseCase {
    override fun getNote(noteId: String): String = visible(noteId)

    override fun recent(limit: Int): List<String> = notes.listRecent(limit)

    override fun create(title: String): String {
        platform.checkQuota()
        val saved = notes.save(title)
        audit.record("create")
        return saved
    }

    override fun delete(noteId: String) {
        visible(noteId)
        notes.softDelete(noteId)
        helperA(1)
    }

    private fun visible(noteId: String): String = notes.find(noteId) ?: error("not found")

    private fun helperA(n: Int): Int = if (n > 3) n else helperB(n + 1)

    private fun helperB(n: Int): Int = helperA(n + 1)
}
