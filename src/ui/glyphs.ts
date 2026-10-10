/**
 * Full & Down glyphs: stencil-simple icons on a 24-unit grid, drawn in currentColor with a 2-unit
 * round line, plus flat fills where a signal colour helps.
 */
const ICONS: Record<string, string> = {
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.3 1.1 2.2h5c0-.9.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
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
  gear: '<path d="M10.3 4.8L10.6 2.1L13.4 2.1L13.7 4.8A7.4 7.4 0 0 1 15.9 5.7L15.9 5.7L18.0 4.0L20.0 6.0L18.3 8.1A7.4 7.4 0 0 1 19.2 10.3L19.2 10.3L21.9 10.6L21.9 13.4L19.2 13.7A7.4 7.4 0 0 1 18.3 15.9L18.3 15.9L20.0 18.0L18.0 20.0L15.9 18.3A7.4 7.4 0 0 1 13.7 19.2L13.7 19.2L13.4 21.9L10.6 21.9L10.3 19.2A7.4 7.4 0 0 1 8.1 18.3L8.1 18.3L6.0 20.0L4.0 18.0L5.7 15.9A7.4 7.4 0 0 1 4.8 13.7L4.8 13.7L2.1 13.4L2.1 10.6L4.8 10.3A7.4 7.4 0 0 1 5.7 8.1L5.7 8.1L4.0 6.0L6.0 4.0L8.1 5.7A7.4 7.4 0 0 1 10.3 4.8Z"/><circle cx="12" cy="12" r="3"/>',
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
