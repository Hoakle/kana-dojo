#!/usr/bin/env node
/**
 * Prepares a checkout of KanaDojo for an offline, French-only static export
 * that gets bundled inside the Android APK (see android-app/).
 *
 * WARNING: this script modifies the working tree in place (deletes server-only
 * routes, rewrites config). Run it on a throwaway copy or in CI only.
 *
 * Usage: node scripts/mobile/prepare-mobile.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const LOCALE = 'fr';

const p = (...parts) => path.join(root, ...parts);

function rm(rel) {
  fs.rmSync(p(rel), { recursive: true, force: true });
}

function edit(rel, fn) {
  const file = p(rel);
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) {
    throw new Error(`prepare-mobile: no change applied to ${rel}`);
  }
  fs.writeFileSync(file, after);
}

if (!fs.existsSync(p('app', '[locale]'))) {
  throw new Error('Run this script from the KanaDojo repository root.');
}

// 1. Remove server-only code: API routes, route handlers, middleware, Sentry.
[
  'app/api',
  'app/llms.txt',
  'app/security.txt',
  'app/sentry-example-page',
  'proxy.ts',
  'instrumentation.ts',
  'instrumentation-client.ts',
  'sentry.edge.config.ts',
  'sentry.server.config.ts',
].forEach(rm);

// 2. Remove pages that need a server (translation API, search params) and
//    their links in the sidebar. Academy articles only exist in English and
//    Resources (48 MB of English link pages) is only useful online.
['translate', 'conjugate', 'academy', 'resources'].forEach(dir =>
  rm(`app/[locale]/${dir}`),
);
edit('shared/ui-composite/Menu/Sidebar.tsx', s =>
  s
    .replace(
      /\n\s*\{ href: '\/translate', label: 'Translate', icon: Languages \},/,
      '',
    )
    .replace(
      /\n\s*\{ href: '\/conjugate', label: 'Conjugate', icon: Repeat \},/,
      '',
    )
    .replace(
      /\n\s*\{ href: '\/academy', label: 'Guides', icon: BookOpen \},/,
      '',
    )
    .replace(
      /\n\s*\{ href: '\/resources', label: 'Resources', icon: Library \},/,
      '',
    ),
);

// 3. French only.
edit('core/i18n/routing.ts', s =>
  s
    .replace(/locales:\s*\[[^\]]*\]/, `locales: ['${LOCALE}']`)
    .replace(/defaultLocale:\s*'[a-z]+'/, `defaultLocale: '${LOCALE}'`),
);
edit('core/i18n/config.ts', s =>
  s
    .replace(
      /export const locales = \[[^\]]*\] as const;/,
      `export const locales = ['${LOCALE}'] as const;`,
    )
    .replace(
      /export const defaultLocale: Locale = '[a-z]+';/,
      `export const defaultLocale: Locale = '${LOCALE}';`,
    ),
);

// 4. Root layout: no request headers in a static export.
edit('app/layout.tsx', s =>
  s
    .replace("import { headers } from 'next/headers';\n", '')
    .replace(
      /const headersList = await headers\(\);\s*const locale = [^;]+;/,
      `const locale = '${LOCALE}';`,
    )
    // No analytics or ads inside the offline app.
    .replace(
      /const isAnalyticsEnabled =[^;]+;/,
      'const isAnalyticsEnabled = false;',
    )
    .replace(
      /const isAdSenseEnabled =[^;]+;/,
      'const isAdSenseEnabled = false;',
    ),
);
// Japanese pronunciation: speechSynthesis polyfill on top of the native
// Android TextToSpeech bridge. MainActivity inlines it at the top of <head>.
fs.copyFileSync(p('scripts/mobile/android-tts.js'), p('public/android-tts.js'));
// The upstream audio button is switched off (renders null): turn it back on.
edit('shared/ui-composite/audio/SSRAudioButton.tsx', s =>
  s
    .replace(
      "import { useAudioPreferences } from '@/features/Preferences';",
      "import { useAudioPreferences } from '@/features/Preferences';\nimport AudioButton from './AudioButton';",
    )
    .replace(
      'const SSRAudioButton: React.FC<SSRAudioButtonProps> = _props => {',
      'const SSRAudioButton: React.FC<SSRAudioButtonProps> = props => {',
    )
    .replace(
      /\/\/ TODO: Re-enable[^\n]*\n\s*return null;/,
      'return <AudioButton {...props} />;',
    ),
);

// 5. No service worker: assets are already local inside the APK.
fs.writeFileSync(
  p('shared/ui-composite/ServiceWorkerRegistration.tsx'),
  `'use client';

import { useEffect } from 'react';

// Mobile (offline APK) build: unregister any service worker, assets are local.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then(regs => regs.forEach(r => void r.unregister()))
        .catch(() => {});
    }
  }, []);
  return null;
}
`,
);
rm('public/sw.js');

// 6a. No Ko-fi donation popup (opened on streak milestones and every other
//     visit to Preferences / Progress) inside the offline app.
edit('app/ClientLayout.tsx', s =>
  s.replace('open={isDonationModalOpen}', 'open={false}'),
);

// 6. No ads inside the offline app.
fs.writeFileSync(
  p('shared/ui-composite/Ads/AdSenseDisplay.tsx'),
  `'use client';

// Mobile (offline APK) build: ads are disabled.
export default function AdSenseDisplay(_props: {
  slot?: string;
  className?: string;
}) {
  return null;
}
`,
);
edit('shared/ui-composite/Game/TransitionAdvertisementOverlay.tsx', s =>
  s.replace(
    '=> TRANSITION_AD_PLACEMENTS.includes(placement);',
    '=> false && TRANSITION_AD_PLACEMENTS.includes(placement);',
  ),
);

// 7. French meanings for kanji and vocabulary (scripts/mobile/fr/*.tsv).
//    kanji-*.tsv:  <kanji>\t<meaning; meaning; ...>
//    vocab-*.tsv:  <jmdict_seq>\t<meaning; ...>  or  <word>|<jmdict_seq>\t...
//    Entries without a translation keep their English meaning.
const frDir = p('scripts/mobile/fr');
const kanjiFr = new Map();
const vocabFr = new Map();
for (const file of fs.existsSync(frDir) ? fs.readdirSync(frDir) : []) {
  if (!file.endsWith('.tsv')) continue;
  const target = file.startsWith('kanji') ? kanjiFr : vocabFr;
  for (const line of fs
    .readFileSync(path.join(frDir, file), 'utf8')
    .split('\n')) {
    const [key, value] = line.split('\t');
    if (key && value?.trim()) target.set(key.trim(), value.trim());
  }
}
const splitMeanings = value =>
  value
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

let kanjiCount = 0;
for (const file of fs.readdirSync(p('public/data-kanji'))) {
  if (!/^N\d\.json$/.test(file)) continue;
  const rel = `public/data-kanji/${file}`;
  const data = JSON.parse(fs.readFileSync(p(rel), 'utf8'));
  for (const entry of data) {
    const fr = kanjiFr.get(entry.kanjiChar);
    if (fr) {
      entry.meanings = splitMeanings(fr);
      kanjiCount++;
    }
  }
  fs.writeFileSync(p(rel), JSON.stringify(data));
}

let vocabCount = 0;
for (const file of fs.readdirSync(p('public/data-vocab'))) {
  if (!/^n\d\.json$/.test(file)) continue;
  const rel = `public/data-vocab/${file}`;
  const data = JSON.parse(fs.readFileSync(p(rel), 'utf8'));
  for (const entry of data) {
    const word = entry.kanji || entry.kana;
    const fr =
      vocabFr.get(`${word}|${entry.jmdict_seq}`) ??
      vocabFr.get(entry.jmdict_seq);
    if (fr) {
      // The app splits definitions on "," and ";".
      entry.waller_definition = splitMeanings(fr.replace(/,/g, ';')).join('; ');
      vocabCount++;
    }
  }
  fs.writeFileSync(p(rel), JSON.stringify(data));
}
console.log(
  `prepare-mobile: French meanings for ${kanjiCount} kanji, ${vocabCount} words.`,
);

// Typed answers: ignore accents and optional French articles.
edit('shared/utils/meanings.ts', s =>
  s.replace(
    ".replace(OPTIONAL_MEANING_PREFIX, '');",
    `.replace(OPTIONAL_MEANING_PREFIX, '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[’]/g, "'")
    .replace(/^(?:l'|(?:le|la|les|un|une|des|du|de la)\\s+)/, '');`,
  ),
);

// 8. Keep only a few Japanese fonts: each Google JP font adds ~2-3 MB of
//    font files to the APK (all 36 fonts weigh ~90 MB).
function keepFonts(rel, keep) {
  edit(rel, s => {
    const removed = new Set();
    let out = s.replace(
      /\n\s*\{\s*name: '([^']+)',\s*font: (\w+),\s*\},?/g,
      (block, name, varName) => {
        if (keep.includes(name)) return block;
        removed.add(varName);
        return '';
      },
    );
    out = out.replace(
      /\nconst (\w+) = \w+\(\{[\s\S]*?\}\);(?=\n)/g,
      (block, varName) => (removed.has(varName) ? '' : block),
    );
    return out;
  });
}
keepFonts('features/Preferences/data/fonts/fonts.prod.ts', [
  'Zen Maru Gothic',
  'Noto Sans JP',
  'Klee One',
  'M PLUS Rounded 1c',
  'Shippori Mincho',
]);
keepFonts('shared/ui-composite/Decorations/decorationFonts.prod.ts', [
  'Zen Maru Gothic',
  'Klee One',
]);

// 9. French demo questions (welcome modal "Essayez-le").
const DEMO_FR = {
  one: 'un',
  two: 'deux',
  three: 'trois',
  big: 'grand',
  small: 'petit',
  mountain: 'montagne',
  river: 'rivière',
  sun: 'soleil',
  moon: 'lune',
  tree: 'arbre',
  mouth: 'bouche',
  person: 'personne',
  five: 'cinq',
  rain: 'pluie',
  field: 'champ',
  cat: 'chat',
  insect: 'insecte',
  fire: 'feu',
  water: 'eau',
  child: 'enfant',
  woman: 'femme',
};
edit('features/Demo/components/DemoGame.tsx', s =>
  s.replace(/meaning: '([^']+)'/g, (m, en) =>
    DEMO_FR[en] ? `meaning: '${DEMO_FR[en].replace(/'/g, "\\'")}'` : m,
  ),
);

// 10. French interface: translate hard-coded English UI text at display time
//     with the dictionary in scripts/mobile/fr/ui.json.
fs.copyFileSync(
  p('scripts/mobile/fr/ui.json'),
  p('shared/ui-composite/MobileTranslator.fr.json'),
);
fs.writeFileSync(
  p('shared/ui-composite/MobileTranslator.tsx'),
  fs.readFileSync(p('scripts/mobile/MobileTranslator.tsx.txt'), 'utf8'),
);
edit('app/[locale]/layout.tsx', s =>
  s
    .replace(
      "import ClientLayout from '../ClientLayout';",
      "import ClientLayout from '../ClientLayout';\nimport MobileTranslator from '@/shared/ui-composite/MobileTranslator';",
    )
    .replace(
      '<ClientLayout>{children}</ClientLayout>',
      '<ClientLayout>{children}</ClientLayout>\n      <MobileTranslator />',
    ),
);

// 11. Static export config.
fs.writeFileSync(
  p('next.config.ts'),
  `import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./core/i18n/request.ts');

// Generated by scripts/mobile/prepare-mobile.mjs (offline APK build).
const nextConfig: NextConfig = {
  output: 'export',
  reactCompiler: true,
  reactStrictMode: true,
  devIndicators: false,
  // Behave like the production site (no preview-only UI such as the welcome
  // modal reopening on every launch).
  env: { NEXT_PUBLIC_VERCEL_ENV: 'production', ANALYTICS_DISABLED: 'true' },
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  turbopack: {
    resolveAlias: {
      '@/entities': './entities',
      '@/features': './features',
      '@/core': './core',
      '@/shared': './shared',
      '@/widgets': './widgets',
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
`,
);

console.log('prepare-mobile: working tree ready for a French offline export.');
