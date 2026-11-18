package com.kanadojo.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Offline KanaDojo: serves the static Next.js export bundled in assets/www
 * from a virtual https origin, so localStorage/IndexedDB work like on the web.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/";
    private static final String ASSET_ROOT = "www";

    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html");
        MIME.put("txt", "text/plain");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("avif", "image/avif");
        MIME.put("gif", "image/gif");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
        MIME.put("ttf", "font/ttf");
        MIME.put("otf", "font/otf");
        MIME.put("opus", "audio/ogg");
        MIME.put("ogg", "audio/ogg");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("wav", "audio/wav");
        MIME.put("xml", "application/xml");
    }

    private WebView webView;
    private AndroidTts androidTts;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        // Japanese pronunciation: native TextToSpeech exposed to the page.
        androidTts = new AndroidTts(this, webView);
        webView.addJavascriptInterface(androidTts, "AndroidTTS");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!HOST.equals(url.getHost())) {
                    return null; // Network (wallpapers, external links) when online.
                }
                return serveAsset(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) {
                    return false;
                }
                // External links (GitHub, Discord...) open in the browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    private WebResourceResponse serveAsset(Uri url) {
        String path = url.getPath();
        if (path == null || path.isEmpty()) {
            path = "/";
        }
        String lastSegment = path.substring(path.lastIndexOf('/') + 1);
        boolean hasExtension = lastSegment.contains(".");
        boolean isRsc = url.getQueryParameter("_rsc") != null && !hasExtension;

        // Mirrors static hosting of a Next.js export: /kana -> kana.html,
        // and React Server Component payloads -> kana.txt.
        List<String> candidates = new ArrayList<>();
        if (isRsc) {
            if (path.endsWith("/")) {
                candidates.add(path + "index.txt");
            } else {
                candidates.add(path + ".txt");
                candidates.add(path + "/index.txt");
            }
        } else if (path.endsWith("/")) {
            candidates.add(path + "index.html");
        } else {
            candidates.add(path);
            if (!hasExtension) {
                candidates.add(path + ".html");
                candidates.add(path + "/index.html");
            }
        }

        for (String candidate : candidates) {
            try {
                InputStream in = getAssets().open(ASSET_ROOT + candidate);
                if (candidate.endsWith(".html")) {
                    in = injectHeadScript(in);
                }
                WebResourceResponse response = new WebResourceResponse(mimeType(candidate), "UTF-8", in);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-cache");
                response.setResponseHeaders(headers);
                return response;
            } catch (IOException ignored) {
                // Try next candidate.
            }
        }

        // Unknown page: show the app's 404 page if present.
        if (!hasExtension && !isRsc) {
            try {
                InputStream in = getAssets().open(ASSET_ROOT + "/404.html");
                WebResourceResponse response = new WebResourceResponse("text/html", "UTF-8", in);
                response.setStatusCodeAndReasonPhrase(404, "Not Found");
                return response;
            } catch (IOException ignored) {
            }
        }
        WebResourceResponse notFound = new WebResourceResponse(
                "text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
        notFound.setStatusCodeAndReasonPhrase(404, "Not Found");
        return notFound;
    }

    private String ttsPolyfill;

    /**
     * Inlines android-tts.js (Web Speech API polyfill, see AndroidTts) as the
     * very first script of each page so it runs before the app.
     */
    private InputStream injectHeadScript(InputStream in) throws IOException {
        if (ttsPolyfill == null) {
            ttsPolyfill = new String(readAll(getAssets().open(ASSET_ROOT + "/android-tts.js")),
                    StandardCharsets.UTF_8);
        }
        String html = new String(readAll(in), StandardCharsets.UTF_8);
        int head = html.indexOf("<head>");
        if (head >= 0) {
            int at = head + "<head>".length();
            html = html.substring(0, at) + "<script>" + ttsPolyfill + "</script>" + html.substring(at);
        }
        return new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream input = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384];
            int n;
            while ((n = input.read(buffer)) != -1) {
                out.write(buffer, 0, n);
            }
            return out.toByteArray();
        }
    }

    private static String mimeType(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase() : "";
        String type = MIME.get(ext);
        return type != null ? type : "application/octet-stream";
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (androidTts != null) {
            androidTts.shutdown();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
