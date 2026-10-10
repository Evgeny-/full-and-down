/* Full & Down — HUD concepts, round 2. Level 12 "Short Stem" as data, a small copy of the rules
   (simulate / bandOf / needAt from src/core/rules.ts, for this level's case), flags, glyphs, and the
   parts of the HUD every concept keeps: the title row, the profit rule and the dock.
   Numbers checked against the real rules by tools/verify-l12.ts. */
const LV = {
  n: 12, title: 'Short Stem', area: 'The Baltic', stars: [28, 30, 32],
  ship: { name: 'Arinaga', capacity: 17, tank: 8, bands: [{ upTo: 5, rate: 1, name: 'LIGHT' }, { upTo: 11, rate: 2, name: 'LADEN' }, { upTo: 17, rate: 3, name: 'DEEP' }] },
  reserve: 1,
  ports: [
    { code: 'KEL', name: 'Kiel', cc: 'de', price: 1, color: '#5b6472' },
    { code: 'LBC', name: 'Lübeck', cc: 'de', price: null, color: '#2c5da8' },
    { code: 'CPH', name: 'Copenhagen', cc: 'dk', price: 1, color: '#2f8a72' },
    { code: 'GOT', name: 'Gothenburg', cc: 'se', price: null, final: true, color: '#7b3f6e' },
  ],
  legs: [{ days: 2 }, { days: 1 }, { days: 1 }],
};
const BAND_COL = ['#8fb3d9', '#4a6fa5', '#1f2e4d'];

function bandOf(w) {
  const b = LV.ship.bands;
  for (let i = 0; i < b.length; i++) if (w <= b[i].upTo) return i;
  return b.length - 1;
}

/** Sail the Kiel call on paper: `cargo` = [{to, w}] loaded at Kiel, `fuel` aboard at departure. */
function project(cargo, fuel) {
  const legs = [];
  let f = fuel;
  let load = cargo.slice();
  for (let i = 0; i < LV.legs.length; i++) {
    if (i > 0) load = load.filter((c) => c.to !== i);
    const cw = load.reduce((s, c) => s + c.w, 0);
    const w = cw + f;
    const band = bandOf(w);
    const burn = LV.legs[i].days * LV.ship.bands[band].rate;
    legs.push({ from: i, to: i + 1, w, cargo: cw, band, rate: LV.ship.bands[band].rate, days: LV.legs[i].days, burn, out: f, in: f - burn });
    f -= burn;
  }
  return legs;
}

/** The next port that sells bunkers after `port` (the reach of this call's fuel). */
function reachOf(port) {
  let u = port + 1;
  while (u < LV.ports.length - 1 && LV.ports[u].price === null) u++;
  return u;
}

/** Fuel to have aboard at Kiel to reach the next pump on the reserve (NEED), given the cargo. */
function needAboard(cargo, startFuel = 1) {
  const until = reachOf(0);
  for (let f = startFuel; f <= LV.ship.tank; f++) {
    const legs = project(cargo, f);
    if (legs.slice(0, until).every((l) => l.in >= LV.reserve)) return f;
  }
  return null;
}

/** A state of the Kiel call, everything the HUD reads. */
function state(cargo, fuel, startFuel = 1) {
  const legs = project(cargo, fuel);
  const until = reachOf(0);
  const cargoW = cargo.reduce((s, c) => s + c.w, 0);
  const need = needAboard(cargo, startFuel);
  const bought = fuel - startFuel;
  const price = LV.ports[0].price;
  const freight = cargo.reduce((s, c) => s + (c.freight ?? 0), 0);
  const firstShort = legs.slice(0, until).find((l) => l.in < LV.reserve);
  return {
    cargo, cargoW, fuel, bought, cost: bought * price, weight: cargoW + fuel, band: bandOf(cargoW + fuel),
    legs, until, need, buy: need === null ? null : Math.max(0, need - fuel), spare: need === null ? 0 : Math.max(0, fuel - need),
    profit: freight - bought * price, short: firstShort ? firstShort.to : null, room: LV.ship.capacity - cargoW - fuel,
  };
}
const CARGO = [{ to: 2, w: 3, freight: 10 }];
const MID = state(CARGO, 5); // 1 t short at Copenhagen
const READY = state(CARGO, 6); // on the reserve at Copenhagen
// mid-plan with the 4 t Copenhagen box held over the ship (a preview: nothing is loaded yet, profit unchanged)
const HELD = Object.assign(state([...CARGO, { to: 2, w: 4, freight: 12 }], 5), { profit: MID.profit, held: 4 });

/* ── flags (national, for the port marks) ── */
function flagSvg(cc, w = 24, h = 16) {
  const f = {
    de: `<rect width="5" height="3" fill="#000"/><rect y="1" width="5" height="1" fill="#dd0000"/><rect y="2" width="5" height="1" fill="#ffce00"/>`,
    dk: `<rect width="37" height="28" fill="#c8102e"/><rect x="12" width="4" height="28" fill="#fff"/><rect y="12" width="37" height="4" fill="#fff"/>`,
    se: `<rect width="16" height="10" fill="#006aa7"/><rect x="5" width="2" height="10" fill="#fecc00"/><rect y="4" width="16" height="2" fill="#fecc00"/>`,
  }[cc];
  const vb = { de: '0 0 5 3', dk: '0 0 37 28', se: '0 0 16 10' }[cc];
  return `<svg class="flag" width="${w}" height="${h}" viewBox="${vb}" preserveAspectRatio="none">${f}</svg>`;
}

/* ── glyphs (the game's own, src/ui/glyphs.ts) ── */
const ICONS = {
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.3 1.1 2.2h5c0-.9.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  fuel: '<path d="M12 3.5c3.5 4.6 5.5 7.6 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.6 2-5.6 5.5-10.2z" fill="#ee8b1e" stroke="none"/>',
  fuelw: '<path d="M12 3.5c3.5 4.6 5.5 7.6 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.6 2-5.6 5.5-10.2z" fill="currentColor" stroke="none"/>',
  anchor: '<circle cx="12" cy="5.5" r="2"/><path d="M12 7.5V20M8 11h8"/><path d="M4.5 14a7.5 7.5 0 0 0 15 0"/>',
  arrow: '<path d="M5 12h13M13 7l5 5-5 5"/>',
  nofuel: '<path d="M12 3.5c3.5 4.6 5.5 7.6 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.6 2-5.6 5.5-10.2z"/><path d="M4 20L20 4"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
};
function glyph(name, size = 22, sw = 2) {
  return `<svg class="g" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}
function starSvg(on, size) {
  return `<svg class="g" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" fill="${on ? '#f5c518' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

/* ── the title row and the profit rule, as in the game ── */
function headHtml(profit) {
  const [t1, , t3] = LV.stars;
  const spread = Math.max(4, t3 - t1);
  const lo = Math.max(0, t1 - spread * 1.6);
  const hi = t3 + Math.max(2, spread * 0.25);
  const pos = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const marks = LV.stars.map((t, i) => `<div class="mark" style="left:${pos(t)}"><i>${'•'.repeat(i + 1)}</i></div>`).join('');
  const legend = LV.stars.map((t, i) => `<span>${starSvg(false, 12).repeat(i + 1)}<b class="num">$${t}</b></span>`).join('');
  return `
  <div class="hud-top"><div class="btn pause">${glyph('pause', 20)}</div>
    <div class="title plate"><span class="lv num">${LV.n}</span><span class="tt"><b>${LV.title}</b><small>${LV.area}</small></span><span class="best">${starSvg(false, 15).repeat(3)}</span></div></div>
  <div class="rule plate"><div class="money num"><span class="cap2">Profit</span><span><small>$</small>${profit}</span></div>
    <div class="rcol"><div class="track">${marks}</div><div class="legend">${legend}</div></div></div>`;
}

/** The dock. `sail` = {blocked, sub} */
function dockHtml(sail) {
  return `<div class="dock"><div class="btn undo">${glyph('undo', 22)}</div><div class="btn hint">${glyph('bulb', 22)}<span>Hint</span></div>
    <div class="btn sail ${sail.blocked ? 'blocked' : ''}"><span class="flagsw"></span><span class="lbl"><b>Sail</b><small>${sail.sub}</small></span></div></div>`;
}
