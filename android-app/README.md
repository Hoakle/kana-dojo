# KanaDojo Android (offline APK)

Native Android app (plain WebView, no framework) that bundles a static,
French-only export of KanaDojo. It works without an internet connection;
progress is stored on the phone.

## How it is built

`.github/workflows/android-apk.yml` runs on every push that touches the app:

1. `scripts/mobile/build-mobile.sh`
   - `prepare-mobile.mjs` removes server-only code (API routes, middleware,
     Sentry, ads, analytics), forces the `fr` locale and switches Next.js to
     `output: 'export'`;
   - `next build` produces the static site in `out/`;
   - `flatten-export.mjs` moves `out/fr/**` to `out/` so URLs match the links;
   - the site is copied to `android-app/app/src/main/assets/www`.
2. `gradle assembleRelease` builds `KanaDojo.apk`, published to the
   `android-latest` release and as a workflow artifact.

`MainActivity` serves the assets from `https://appassets.androidplatform.net/`
and maps `/kana` to `kana.html` (and `?_rsc` requests to `kana.txt`), like a
static host would.

## Build locally

The build scripts modify the working tree: run them on a throwaway copy.
Requires Node 22, JDK 17+, Gradle 8.11 and the Android SDK.

```bash
npm ci --ignore-scripts
./scripts/mobile/build-mobile.sh
cd android-app && gradle assembleRelease
```

## Signing

`app/keystore/kanadojo.keystore` is a personal side-loading key committed on
purpose, so each new APK installs over the previous one without losing
progress. Do not use it for a store release.
