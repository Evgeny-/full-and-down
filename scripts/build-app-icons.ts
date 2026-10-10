/**
 * App icons and the inline loading wordmark from src/ui/logoArtwork.ts.
 * Run: bun scripts/build-app-icons.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { BRAND, iconFile, monogramArtwork, wordmarkSvg } from '../src/ui/logoArtwork';

const file = (name: string) => new URL(`../public/${name}`, import.meta.url);
const png = (svg: string, size: number) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

writeFileSync(file('icon.svg'), iconFile('rounded'));
// A heavier waterline holds up at browser-tab sizes.
writeFileSync(file('favicon.svg'), iconFile('rounded', true));
// Apple and Android apply their own mask, so the art fills every corner.
writeFileSync(file('apple-touch-icon.png'), png(iconFile('square'), 180));
writeFileSync(file('icon-192.png'), png(iconFile('rounded'), 192));
writeFileSync(file('icon-512.png'), png(iconFile('rounded'), 512));
writeFileSync(file('icon-maskable-512.png'), png(iconFile('maskable'), 512));
writeFileSync(file('wordmark.svg'), wordmarkSvg().replace('<svg ', `<svg width="594" height="80" style="color:${BRAND.navy}" `));

// The loading screen needs the same lettering before JavaScript or fonts arrive.
const indexFile = new URL('../index.html', import.meta.url);
const html = readFileSync(indexFile, 'utf8');
const marker = /<!-- boot-brand-start -->[\s\S]*?<!-- boot-brand-end -->/;
const hullMarker = /<!-- boot-hull-brand-start -->[\s\S]*?<!-- boot-hull-brand-end -->/;
if (!marker.test(html) || !hullMarker.test(html)) throw new Error('Loading brand markers are missing from index.html');
const branded = html
  .replace(marker, `<!-- boot-brand-start -->\n        <h1 class="boot-title" aria-label="Full &amp; Down">${wordmarkSvg('boot-lettering')}</h1>\n        <!-- boot-brand-end -->`)
  .replace(hullMarker, `<!-- boot-hull-brand-start -->\n            <g transform="translate(346 222) scale(.35)">${monogramArtwork(BRAND.enamel)}</g>\n            <!-- boot-hull-brand-end -->`);
writeFileSync(indexFile, branded);
console.log('icons and wordmark written');
