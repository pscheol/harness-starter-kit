package im.demo.note.infra.persistence

import org.springframework.data.jpa.repository.JpaRepository

interface NoteJpaRepository : JpaRepository<NoteJpaEntity, Long>
