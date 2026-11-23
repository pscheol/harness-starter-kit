package im.demo.note.application.output

interface AuditPort {
    fun record(action: String)
}
