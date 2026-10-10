// Give each regenerated social image a fresh URL so link-preview caches can
// distinguish it from previous artwork. Keep og.jpg for existing direct links.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
export function updateSocialMetadata() {
  const jpeg = readFileSync(new URL('public/og.jpg', root));
  const hash = createHash('sha256').update(jpeg).digest('hex').slice(0, 12);
  const file = `og-${hash}.jpg`;
  writeFileSync(new URL(`public/${file}`, root), jpeg);
  const site = 'https://evgeny.io/games/full-and-down/';
  const image = `${site}${file}`;
  const index = new URL('index.html', root);
  const html = readFileSync(index, 'utf8');
  const metadata = `    <link rel="canonical" href="${site}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Full &amp; Down" />
    <meta property="og:url" content="${site}" />
    <meta property="og:title" content="Full &amp; Down: load her to the marks" />
    <meta property="og:description" content="Plan a short voyage: which boxes, which stacks, how much fuel. Fuel weighs too." />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Full &amp; Down, a loaded ship alongside a colourful harbour." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Full &amp; Down: load her to the marks" />
    <meta name="twitter:description" content="Plan a short voyage: which boxes, which stacks, how much fuel. Fuel weighs too." />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="Full &amp; Down, a loaded ship alongside a colourful harbour." />`;
  const start = html.indexOf('    <link rel="canonical"');
  const legacyStart = html.indexOf('    <meta property="og:type"');
  const end = html.indexOf('    <!-- Inline artwork');
  const from = start >= 0 ? start : legacyStart;
  if (from < 0 || end < from) throw new Error('Social metadata block not found in index.html');
  writeFileSync(index, html.slice(0, from) + metadata + '\n' + html.slice(end));
  return { file, image, hash };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(updateSocialMetadata());
}
