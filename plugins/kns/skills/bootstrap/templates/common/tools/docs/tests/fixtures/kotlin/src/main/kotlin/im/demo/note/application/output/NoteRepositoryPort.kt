package im.demo.note.application.output

import im.demo.common.CacheNames
import org.springframework.cache.annotation.Cacheable

interface NoteRepositoryPort {
    fun find(noteId: String): String?

    @Cacheable(cacheNames = [CacheNames.NOTE_LIST], key = "@cacheKeys.workspace(#workspaceNo, 'recent')")
    fun listRecent(limit: Int): List<String>

    fun save(title: String): String

    fun softDelete(noteId: String)
}
