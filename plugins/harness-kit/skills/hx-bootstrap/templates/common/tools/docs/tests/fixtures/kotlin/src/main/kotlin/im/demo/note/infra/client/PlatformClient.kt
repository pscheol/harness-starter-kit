package im.demo.note.infra.client

class PlatformClient(
    private val http: RestClient,
) {
    fun checkQuota(): Boolean = http.get().uri("/internal/quota").retrieve().body(Boolean::class.java) ?: false
}
