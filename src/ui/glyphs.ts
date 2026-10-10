/**
 * Full & Down glyphs: stencil-simple icons on a 24-unit grid, drawn in currentColor with a 2-unit
 * round line, plus flat fills where a signal colour helps.
 */
const ICONS: Record<string, string> = {
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -4)"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  star: '<path class="f" d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>',
  fuel: '<path class="f" d="M12 3.5c3.5 4.6 5.5 7.6 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.6 2-5.6 5.5-10.2z" fill="#ee8b1e"/>',
  anchor: '<circle cx="12" cy="5.5" r="2"/><path d="M12 7.5V20M8 11h8"/><path d="M4.5 14a7.5 7.5 0 0 0 15 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  map: '<path d="M3.5 6l5.5-2 6 2 5.5-2v14l-5.5 2-6-2-5.5 2z"/><path d="M9 4v14M15 6v14"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  ship: '<path d="M3 15h18l-2.5 4.5h-13z"/><path d="M6 15V9h5v6M13 15v-4h5v4"/><path d="M8 9V6h2"/>',
  arrow: '<path d="M5 12h13M13 7l5 5-5 5"/>',
  restart: '<path d="M5 12a7 7 0 1 0 2-5"/><path d="M5 4v4h4"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z"/>',
  book: '<path d="M4 5.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4zM20 5.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z"/>',
};

export function glyph(name: keyof typeof ICONS | string, size = 22, cls = ''): string {
  const body = ICONS[name] ?? '';
  return `<svg class="glyph ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** A star as a stamp-ready SVG (filled or empty). */
export function starSvg(filled: boolean, size = 18): string {
  return `<svg class="starg ${filled ? 'on' : 'off'}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" fill="${filled ? '#f5c518' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}
