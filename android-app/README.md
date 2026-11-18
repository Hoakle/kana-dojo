# KanaDojo Android (APK)

Android wrapper built with [Capacitor](https://capacitorjs.com). The app opens
https://kanadojo.com full screen in a native WebView. Your progress is stored
on the phone (same as in the browser), and an internet connection is required.

## Get the APK

Every push that touches `android-app/` runs the **Build Android APK** GitHub
Actions workflow (`.github/workflows/android-apk.yml`). It:

- uploads `KanaDojo.apk` as a workflow artifact, and
- publishes it to the `android-latest` release (Releases page of the repo).

On your phone, open the release page, download `KanaDojo.apk` and open it.
Android will ask you to allow installs from this source the first time.

## Build locally

Requires Node 20+, JDK 21 and the Android SDK (`ANDROID_HOME` set).

```bash
cd android-app
npm ci
npx cap add android
npm run icons
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Config

- `capacitor.config.json`: app id, name and the site URL (`server.url`).
- `assets/icon.png`, `assets/splash.png`: source images for launcher icon and splash.
- `www/index.html`: fallback page shown if the site can't load.
