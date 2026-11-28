package com.plugin.foxnest_audio

import android.app.Activity
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class PlayArgs {
  lateinit var id: String
  lateinit var url: String
  var title: String = ""
  var positionSecs: Double = 0.0
  var durationSecs: Double = 0.0
  var rate: Double = 1.0
}

@InvokeArg
class SeekArgs {
  var seconds: Double = 0.0
}

@InvokeArg
class SkipArgs {
  var deltaSeconds: Double = 0.0
}

@InvokeArg
class RateArgs {
  var rate: Double = 1.0
}

@TauriPlugin
class FoxnestAudioPlugin(private val activity: Activity) : Plugin(activity) {
  override fun load(webView: android.webkit.WebView) {
    super.load(webView)
    // `trigger` targets this plugin's webview; the JS side listens via
    // addPluginListener('state', ...). Cleared on unload to avoid leaks.
    AudioRuntime.emitter = { state -> trigger("state", state) }
  }

  private fun ensureService(): Boolean {
    if (AudioRuntime.service != null) return true
    return try {
      ContextCompat.startForegroundService(
        activity.applicationContext,
        Intent(activity.applicationContext, PlaybackService::class.java),
      )
      true
    } catch (e: Exception) {
      false
    }
  }

  // Rust commands return `()`; resolve null (not an empty JSObject) so serde
  // can deserialize the reply into unit.
  private fun resolveEmpty(invoke: Invoke) = invoke.resolve()

  @Command
  fun play(invoke: Invoke) {
    val args = invoke.parseArgs(PlayArgs::class.java)
    if (!ensureService()) {
      invoke.reject("无法启动后台播放服务")
      return
    }
    AudioRuntime.withService { service ->
      try {
        service.play(
          args.id,
          args.url,
          args.title,
          args.positionSecs,
          args.durationSecs,
          args.rate,
        )
        resolveEmpty(invoke)
      } catch (e: Exception) {
        invoke.reject(e.message ?: "播放启动失败")
      }
    }
  }

  @Command
  fun pause(invoke: Invoke) {
    AudioRuntime.withService { it.pause() }
    resolveEmpty(invoke)
  }

  @Command
  fun resume(invoke: Invoke) {
    AudioRuntime.withService { it.resume() }
    resolveEmpty(invoke)
  }

  @Command
  fun seek(invoke: Invoke) {
    val args = invoke.parseArgs(SeekArgs::class.java)
    AudioRuntime.withService { it.seek(args.seconds) }
    resolveEmpty(invoke)
  }

  @Command
  fun skip(invoke: Invoke) {
    val args = invoke.parseArgs(SkipArgs::class.java)
    AudioRuntime.withService { it.skip(args.deltaSeconds) }
    resolveEmpty(invoke)
  }

  @Command
  fun setRate(invoke: Invoke) {
    val args = invoke.parseArgs(RateArgs::class.java)
    AudioRuntime.withService { it.setRate(args.rate) }
    resolveEmpty(invoke)
  }

  @Command
  fun stop(invoke: Invoke) {
    AudioRuntime.withService { it.stop() }
    resolveEmpty(invoke)
  }

  @Command
  fun getState(invoke: Invoke) {
    val service = AudioRuntime.service
    if (service == null) {
      val empty = JSObject()
      // Rust deserializes into PlaybackState, which requires a non-optional id.
      empty.put("id", "")
      empty.put("paused", true)
      empty.put("currentTime", 0.0)
      empty.put("duration", 0.0)
      empty.put("rate", 1.0)
      empty.put("buffering", false)
      empty.put("ended", false)
      invoke.resolve(empty)
      return
    }
    invoke.resolve(service.state())
  }
}
