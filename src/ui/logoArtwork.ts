/** Shared vector artwork. Kept free of CSS so the app-icon generator can import it. */
export const BRAND = {
  navy: '#1f2e4d',
  enamel: '#f8f7f2',
  orange: '#ee8b1e',
  sea: '#2d8daf',
} as const;

/** F/D share the bow cuts of the title; the orange line descends with the loaded hull. */
export function monogramArtwork(ink = 'currentColor', simple = false): string {
  return `<g transform="translate(0 4)">
    <path d="M14 18h33l-4 12H26v10h15l-4 11H26v23H14zM51 18h18l19 18v19L69 74H51zM63 30v32h2l11-11V40L65 30z" fill="${ink}" fill-rule="evenodd"/>
    <path d="M8 54h37l8 8h38" fill="none" stroke="${BRAND.orange}" stroke-width="${simple ? 6.5 : 5.5}" stroke-linejoin="miter"/>
  </g>`;
}

/** The app-icon tile. Essential artwork remains inside the maskable 80% circle. */
export function iconFile(shape: 'rounded' | 'square' | 'maskable', simple = false): string {
  const rx = shape === 'rounded' ? 22 : 0;
  const scale = shape === 'maskable' ? 0.84 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">
  <rect width="100" height="100" rx="${rx}" fill="${BRAND.navy}"/>
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${monogramArtwork(BRAND.enamel, simple)}</g>
</svg>
`;
}

/** Standalone emblem for the interface. */
export function emblemSvg(cls = ''): string {
  return `<svg class="brand-emblem ${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${monogramArtwork()}</svg>`;
}

/** Drawn letterforms rather than a font dependency. Their angled terminals repeat the bow. */
export function wordmarkSvg(cls = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="brand-lettering ${cls}" viewBox="0 0 297 40" aria-hidden="true" focusable="false" fill="currentColor" fill-rule="evenodd">
    <path d="M0 0h22l-2 7H7v9h12l-2 7H7v17H0z"/>
    <path transform="translate(28)" d="M0 0h7v30l3 3h4l3-3V0h7v33l-7 7H7l-7-7z"/>
    <path transform="translate(58)" d="M0 0h7v33h14l-2 7H0z"/>
    <path transform="translate(85)" d="M0 0h7v33h14l-2 7H0z"/>
    <path class="brand-amp" fill="#c96d0e" transform="translate(119)" d="M25 40l-5-6c-4 4-8 6-12 6-6 0-8-4-8-10 0-5 3-8 8-12C4 14 2 12 2 8c0-5 4-8 10-8s10 3 10 8c0 5-4 8-8 11l7 8 3-6h7l-6 12 6 7zM12 6c-2 0-3 1-3 3s1 4 3 6c3-2 4-4 4-6s-2-3-4-3zM11 23c-3 2-4 4-4 6 0 3 1 5 4 5 2 0 4-2 5-4z"/>
    <path transform="translate(164)" d="M0 0h14l13 13v14L14 40H0zM7 7v26h4l9-9v-8l-9-9z"/>
    <path transform="translate(197)" d="M8 0h10l8 8v24l-8 8H8l-8-8V8zM9 7l-2 3v20l2 3h8l2-3V10l-2-3z"/>
    <path transform="translate(229)" d="M0 0h7l3 28 5-19h5l5 19 3-28h7l-6 40h-7l-4.5-17L13 40H6z"/>
    <path transform="translate(270)" d="M0 40V0h7l13 26V0h7v40h-7L7 14v26z"/>
  </svg>`;
}

/** Retained for places that need the actual maritime load-line symbol. */
export function discSvg(cls = ''): string {
  return `<svg class="disc ${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="50" cy="50" r="27" fill="none" stroke="currentColor" stroke-width="7"/><rect x="12" y="46.5" width="76" height="7" rx="1" fill="currentColor"/></svg>`;
}
