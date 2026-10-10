/**
 * Schematic coast art for the eight pilot charts, separate from campaign behavior.
 * x spans a 340-unit sheet; y spans 100 units and scales with the voyage track.
 * Broad headlands and a few sheltered inlets stay outside the playable route.
 */
const COASTS: readonly (readonly string[])[] = [
  [
    'M0 22 C12 22 8 25 20 26 C37 25 22 31 27 33 Q39 34 35 39 C28 42 39 47 30 51 Q20 53 22 57 L0 59Z',
    'M340 0 L326 0 C317 5 334 8 324 12 Q314 16 328 19 C333 20 332 23 340 24Z',
    'M340 61 C327 60 321 66 326 69 Q311 72 319 75 C326 77 321 84 336 87 L340 87Z',
  ],
  [
    'M0 0 L34 0 C35 7 22 10 28 16 Q32 20 20 25 C10 28 24 33 13 38 Q6 42 0 43Z',
    'M340 13 C325 12 321 17 326 21 Q330 25 320 28 C315 31 328 35 340 36Z',
    'M0 68 C12 65 22 69 19 73 Q25 76 9 80 L0 80Z',
    'M340 84 C319 80 313 87 324 91 Q330 95 320 100 L340 100Z',
  ],
  [
    'M0 0 L39 0 C42 6 17 7 22 12 Q29 15 16 19 C9 21 6 19 0 24Z',
    'M340 0 L320 0 C307 5 331 10 320 13 Q310 17 326 19 C335 21 329 24 340 26Z',
    'M0 81 C10 77 20 80 24 85 Q43 88 31 93 C25 96 37 99 34 100 L0 100Z',
  ],
  [
    'M0 0 L32 0 C33 6 23 9 26 15 Q30 19 16 23 C8 24 11 27 0 28Z',
    'M340 28 C325 26 315 32 325 38 Q330 42 320 45 C313 48 328 52 340 52Z',
    'M0 83 C10 80 18 86 26 87 Q36 89 29 94 C25 98 37 100 37 100 L0 100Z',
  ],
  [
    'M340 0 L313 0 C309 7 330 9 324 14 Q315 18 326 23 C335 25 328 30 340 33Z',
    'M0 39 C12 38 22 46 19 51 Q17 57 30 61 C42 65 31 72 24 69 Q14 66 12 59 C11 54 4 54 0 54Z',
    'M340 82 C328 79 319 85 324 90 Q330 94 319 97 L318 100 L340 100Z',
  ],
  [
    'M0 0 L20 0 C21 7 31 8 30 14 Q24 18 33 22 C30 27 15 25 12 20 Q8 17 0 18Z',
    'M340 40 C328 37 319 44 323 50 Q328 55 317 59 C309 64 324 68 326 74 Q328 78 340 78Z',
    'M0 89 C14 85 13 92 26 94 Q35 95 28 100 L0 100Z',
  ],
  [
    'M0 0 L38 0 C36 7 17 7 23 13 Q30 18 15 22 C7 25 15 28 0 31Z',
    'M340 19 C327 15 319 23 325 28 Q332 33 324 35 C325 41 331 43 340 42Z',
    'M0 80 C13 78 17 84 28 85 Q37 87 29 92 C24 96 34 98 31 100 L0 100Z',
  ],
  [
    'M0 13 C15 12 29 19 23 24 Q18 28 28 32 C39 37 27 41 21 43 Q16 49 0 51Z',
    'M340 0 L320 0 C318 6 327 7 323 12 Q317 16 331 18 C337 20 334 23 340 24Z',
    'M340 73 C327 69 316 74 322 79 Q328 83 317 86 C310 90 325 94 322 100 L340 100Z',
  ],
];

export function coastMarkup(area: number, height: number): string {
  const paths = COASTS[area % COASTS.length].map((d) => `<path d="${d}" vector-effect="non-scaling-stroke"/>`).join('');
  return `<g transform="scale(1 ${height / 100})"><g class="coast-shelf">${paths}</g><g class="coast-land">${paths}</g></g>`;
}
