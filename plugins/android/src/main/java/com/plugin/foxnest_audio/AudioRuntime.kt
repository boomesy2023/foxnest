package com.plugin.foxnest_audio

import app.tauri.plugin.JSObject

/**
 * Process-wide bridge between the Tauri plugin (which lives with the Activity)
 * and the foreground playback service. Both run in the same process, so a
 * direct reference avoids a MediaController round-trip for every command.
 */
internal object AudioRuntime {
    @Volatile
    var service: PlaybackService? = null

    @Volatile
    var emitter: ((JSObject) -> Unit)? = null

    private val pending = mutableListOf<(PlaybackService) -> Unit>()

    /** Queue work until the service has finished creating its player. */
    fun withService(action: (PlaybackService) -> Unit) {
        val current = service
        if (current != null) {
            action(current)
        } else {
            synchronized(pending) { pending.add(action) }
        }
    }

    fun onServiceReady(service: PlaybackService) {
        this.service = service
        val queued: List<(PlaybackService) -> Unit>
        synchronized(pending) {
            queued = pending.toList()
            pending.clear()
        }
        queued.forEach { it(service) }
    }

    fun onServiceGone(service: PlaybackService) {
        if (this.service === service) this.service = null
    }

    fun emit(state: JSObject) {
        emitter?.invoke(state)
    }

    fun clearEmitter() {
        emitter = null
    }
}
