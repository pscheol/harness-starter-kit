package im.demo.note.infra.persistence

import org.springframework.stereotype.Repository

@Repository
class NoteJdslQueries(
    private val entityManager: EntityManager,
) {
    fun find(noteId: String): String? {
        val query =
            jpql {
                select(path(NoteJpaEntity::title))
                    .from(entity(NoteJpaEntity::class))
            }
        return entityManager.createQuery(query).resultList.firstOrNull()
    }

    fun softDelete(noteId: String): Int {
        val query =
            jpql {
                update(entity(NoteJpaEntity::class))
                    .set(path(NoteJpaEntity::title), "")
            }
        return entityManager.createQuery(query).executeUpdate()
    }
}
