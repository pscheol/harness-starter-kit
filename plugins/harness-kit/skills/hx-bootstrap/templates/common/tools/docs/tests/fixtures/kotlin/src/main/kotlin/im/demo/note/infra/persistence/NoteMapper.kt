package im.demo.note.infra.persistence

object NoteMapper {
    fun toEntity(title: String): NoteJpaEntity = NoteJpaEntity(0, title)
}
