package com.kanadojo.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import java.util.Locale;

/**
 * Bridge exposed to the page as window.AndroidTTS. Android WebView has no
 * Web Speech API (speechSynthesis), so public/android-tts.js polyfills it on
 * top of this native TextToSpeech engine.
 */
public class AndroidTts {

    private final Activity activity;
    private final WebView webView;
    private TextToSpeech tts;
    private volatile boolean ready = false;
    private volatile boolean japanese = false;
    private boolean warnedMissingVoice = false;

    public AndroidTts(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        tts = new TextToSpeech(activity.getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS) {
                return;
            }
            int result = tts.setLanguage(Locale.JAPAN);
            japanese = result != TextToSpeech.LANG_MISSING_DATA
                    && result != TextToSpeech.LANG_NOT_SUPPORTED;
            ready = true;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {
                    dispatch(id, "start");
                }

                @Override
                public void onDone(String id) {
                    dispatch(id, "end");
                }

                @Override
                @SuppressWarnings("deprecation")
                public void onError(String id) {
                    dispatch(id, "error");
                }

                @Override
                public void onStop(String id, boolean interrupted) {
                    dispatch(id, "interrupted");
                }
            });
            activity.runOnUiThread(() -> webView.evaluateJavascript(
                    "window.__androidTtsReady && window.__androidTtsReady()", null));
        });
    }

    private void dispatch(String id, String type) {
        String js = "window.__androidTtsEvent && window.__androidTtsEvent("
                + org.json.JSONObject.quote(id) + "," + org.json.JSONObject.quote(type) + ")";
        activity.runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    @JavascriptInterface
    public boolean isReady() {
        return ready;
    }

    @JavascriptInterface
    public boolean hasJapanese() {
        return japanese;
    }

    @JavascriptInterface
    public boolean isSpeaking() {
        return ready && tts.isSpeaking();
    }

    @JavascriptInterface
    public void speak(String text, float rate, float pitch, String id) {
        if (!ready) {
            dispatch(id, "error");
            return;
        }
        if (!japanese) {
            dispatch(id, "error");
            askToInstallJapaneseVoice();
            return;
        }
        tts.setSpeechRate(rate);
        tts.setPitch(pitch);
        Bundle params = new Bundle();
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, id);
    }

    @JavascriptInterface
    public void cancel() {
        if (ready) {
            tts.stop();
        }
    }

    private void askToInstallJapaneseVoice() {
        if (warnedMissingVoice) {
            return;
        }
        warnedMissingVoice = true;
        activity.runOnUiThread(() -> {
            Toast.makeText(activity,
                    "Voix japonaise absente : installez-la dans les réglages de synthèse vocale.",
                    Toast.LENGTH_LONG).show();
            try {
                Intent install = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
                install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(install);
            } catch (Exception ignored) {
            }
        });
    }

    public void shutdown() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
    }
}
