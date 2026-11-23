package im.demo.note.infra.audit

import im.demo.note.application.output.AuditPort
import org.springframework.stereotype.Component

@Component
class DbAudit(
    private val jdbc: JdbcClient,
) : AuditPort {
    override fun record(action: String) {
        jdbc.sql("""
            INSERT INTO note.nte_audit (action) VALUES (:action)
        """.trimIndent()).param("action", action).update()
    }
}
