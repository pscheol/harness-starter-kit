package im.demo.note.infra.persistence

import im.demo.note.application.output.NoteRepositoryPort
import org.springframework.stereotype.Repository

@Repository
class NotePersistenceAdapter(
    private val entityManager: EntityManager,
    private val queries: NoteJdslQueries,
    private val jpa: NoteJpaRepository,
) : NoteRepositoryPort {
    override fun find(noteId: String): String? = queries.find(noteId)

    override fun listRecent(limit: Int): List<String> = jpa.findAll().map { it.title }

    override fun save(title: String): String {
        entityManager.persist(NoteMapper.toEntity(title))
        return title
    }

    override fun softDelete(noteId: String) {
        queries.softDelete(noteId)
    }
}
