package im.demo.note.infra.audit

import im.demo.note.application.output.AuditPort

class LogAudit : AuditPort {
    override fun record(action: String) {
        println(action)
    }
}
