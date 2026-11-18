#!/usr/bin/env node
/**
 * Moves the single-locale static export (out/fr/**) to the root of out/ so
 * the URLs match next-intl's `localePrefix: 'never'` links (/kana, /kanji...).
 *
 * Usage: node scripts/mobile/flatten-export.mjs [outDir] [locale]
 */
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] ?? 'out');
const locale = process.argv[3] ?? 'fr';
const localeDir = path.join(outDir, locale);

if (!fs.existsSync(localeDir)) {
  throw new Error(`flatten-export: ${localeDir} not found`);
}

function moveInto(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      moveInto(from, to);
    } else {
      fs.renameSync(from, to);
    }
  }
}

moveInto(localeDir, outDir);
fs.rmSync(localeDir, { recursive: true, force: true });

for (const ext of ['html', 'txt']) {
  const from = path.join(outDir, `${locale}.${ext}`);
  if (fs.existsSync(from)) {
    fs.renameSync(from, path.join(outDir, `index.${ext}`));
  }
}

console.log(`flatten-export: ${locale}/ moved to the root of ${outDir}`);
