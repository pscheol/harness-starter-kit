package im.demo.note.infra.persistence

import jakarta.persistence.Entity
import jakarta.persistence.Table

@Entity
@Table(schema = "note", name = "nte_note")
class NoteJpaEntity(
    val noteNo: Long,
    val title: String,
)
