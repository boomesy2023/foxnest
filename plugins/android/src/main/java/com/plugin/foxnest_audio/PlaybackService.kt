package com.plugin.foxnest_audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.support.v4.media.session.MediaSessionCompat
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import app.tauri.plugin.JSObject

/** One foreground service owns the only ExoPlayer instance in the app. */
class PlaybackService : Service() {
    private lateinit var player: ExoPlayer
    private lateinit var session: MediaSession
    private val handler = Handler(Looper.getMainLooper())
    private var currentId: String = ""
    private var durationHintSecs: Double = 0.0
    private var errorMessage: String? = null

    private val ticker = object : Runnable {
        override fun run() {
            emitState()
            handler.postDelayed(this, 1000L)
        }
    }

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (!isPlaying && player.playbackState == Player.STATE_IDLE) return
            emitState()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            emitState()
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            currentId = mediaItem?.mediaId ?: ""
            durationHintSecs = 0.0
            emitState()
        }

        override fun onPlayerError(error: PlaybackException) {
            errorMessage = "音频加载失败，请检查网络或稍后重试"
            emitState()
        }
    }

    override fun onCreate() {
        super.onCreate()
        createChannel()

        player = ExoPlayer.Builder(this)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        player.setAudioAttributes(
            AudioAttributes.Builder()
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .setUsage(C.USAGE_MEDIA)
                .build(),
            true,
        )
        player.addListener(listener)
        session = MediaSession.Builder(this, player)
            .setSessionActivity(launchIntent())
            .build()

        startForeground(NOTIFICATION_ID, buildNotification())
        handler.post(ticker)
        AudioRuntime.onServiceReady(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY_PAUSE -> if (player.isPlaying) pause() else resume()
            ACTION_SKIP_BACK -> skip(-15.0)
            ACTION_SKIP_FORWARD -> skip(15.0)
            ACTION_STOP -> AudioRuntime.withService { it.stop() }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): Nothing? = null

    override fun onDestroy() {
        handler.removeCallbacks(ticker)
        AudioRuntime.onServiceGone(this)
        player.removeListener(listener)
        session.release()
        player.release()
        super.onDestroy()
    }

    fun play(
        id: String,
        url: String,
        title: String,
        positionSecs: Double,
        durationSecs: Double,
        rate: Double,
    ) {
        currentId = id
        durationHintSecs = durationSecs
        errorMessage = null
        val item = MediaItem.Builder()
            .setUri(url)
            .setMediaId(id)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(title).build())
            .build()
        player.setMediaItem(item)
        player.playbackParameters = androidx.media3.common.PlaybackParameters(rate.toFloat())
        player.prepare()
        if (positionSecs > 0) player.seekTo((positionSecs * 1000L).toLong())
        player.play()
        updateNotification()
        emitState()
    }

    fun pause() {
        player.pause()
        updateNotification()
        emitState()
    }

    fun resume() {
        if (player.playbackState == Player.STATE_IDLE) return
        errorMessage = null
        player.play()
        updateNotification()
        emitState()
    }

    fun seek(seconds: Double) {
        val clamped = seconds.coerceAtLeast(0.0)
        player.seekTo((clamped * 1000L).toLong())
        emitState()
    }

    fun skip(deltaSeconds: Double) {
        seek(player.currentPosition / 1000.0 + deltaSeconds)
    }

    fun setRate(rate: Double) {
        player.playbackParameters = androidx.media3.common.PlaybackParameters(rate.toFloat())
        emitState()
    }

    fun stop() {
        player.stop()
        player.clearMediaItems()
        currentId = ""
        durationHintSecs = 0.0
        errorMessage = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        emitState()
    }

    fun state(): JSObject {
        val durationMs = if (player.duration == C.TIME_UNSET) {
            (durationHintSecs * 1000L).toLong()
        } else {
            player.duration
        }
        val state = JSObject()
        state.put("id", currentId)
        state.put("currentTime", player.currentPosition / 1000.0)
        state.put("duration", durationMs / 1000.0)
        state.put("paused", !player.isPlaying)
        state.put("rate", player.playbackParameters.speed.toDouble())
        state.put("buffering", player.playbackState == Player.STATE_BUFFERING)
        state.put(
            "ended",
            player.playbackState == Player.STATE_ENDED && !player.isPlaying,
        )
        if (errorMessage != null) state.put("error", errorMessage)
        return state
    }

    fun emitState() {
        AudioRuntime.emit(state())
    }

    private fun updateNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        // Media3's sessionCompatToken is already a MediaSessionCompat.Token;
        // wrapping it again with fromToken() throws at runtime.
        val sessionToken = session.sessionCompatToken
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Foxnest")
            .setContentText(currentTitle())
            .setContentIntent(launchIntent())
            .setOnlyAlertOnce(true)
            .setOngoing(player.isPlaying)
            .setStyle(
                androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(sessionToken)
                    .setShowActionsInCompactView(0, 1, 2),
            )
            .addAction(android.R.drawable.ic_media_previous, "后退 15 秒", actionIntent(ACTION_SKIP_BACK, 1))
            .addAction(
                if (player.isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (player.isPlaying) "暂停" else "播放",
                actionIntent(ACTION_PLAY_PAUSE, 2),
            )
            .addAction(android.R.drawable.ic_media_next, "前进 15 秒", actionIntent(ACTION_SKIP_FORWARD, 3))
            .build()
    }

    private fun currentTitle(): String {
        val metadata = player.currentMediaItem?.mediaMetadata
        return metadata?.title?.toString()?.takeIf { it.isNotBlank() } ?: "播客播放中"
    }

    private fun actionIntent(action: String, requestCode: Int): PendingIntent {
        val intent = Intent(this, PlaybackService::class.java).setAction(action)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getService(this, requestCode, intent, flags)
    }

    private fun launchIntent(): PendingIntent {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(this, 0, intent, flags)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "播客播放",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply { setSound(null, null) },
            )
        }
    }

    companion object {
        private const val CHANNEL_ID = "foxnest_playback"
        private const val NOTIFICATION_ID = 1001
        private const val ACTION_PLAY_PAUSE = "com.ifox.foxnest.audio.PLAY_PAUSE"
        private const val ACTION_SKIP_BACK = "com.ifox.foxnest.audio.SKIP_BACK"
        private const val ACTION_SKIP_FORWARD = "com.ifox.foxnest.audio.SKIP_FORWARD"
        private const val ACTION_STOP = "com.ifox.foxnest.audio.STOP"
    }
}
