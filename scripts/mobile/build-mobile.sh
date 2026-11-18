#!/usr/bin/env bash
# Builds the offline French static site and copies it into the Android app.
# WARNING: modifies the working tree (see prepare-mobile.mjs). Use in CI or
# on a throwaway copy of the repository.
set -euo pipefail

cd "$(dirname "$0")/../.."

node scripts/generate-commit-info.mjs || true
node scripts/mobile/prepare-mobile.mjs
NEXT_TELEMETRY_DISABLED=1 npx next build
node scripts/mobile/flatten-export.mjs out fr

dest=android-app/app/src/main/assets/www
rm -rf "$dest"
mkdir -p "$(dirname "$dest")"
cp -R out "$dest"
echo "build-mobile: static site copied to $dest ($(du -sh "$dest" | cut -f1))"
