// Review page for src/render/nations.ts: every flag at 96×64 and 24×16 (plus the 24×16 blown up 3×,
// and the <img> from nationImg), and a check that the game's ports and a list of well-known ports resolve.
import levels from '../src/data/levels.json';
import { drawNation, NATIONS, nationImg, nationName, nationOfPort, type Nation } from '../src/render/nations';

const dpr = window.devicePixelRatio || 1;

function flagCanvas(n: Nation, w: number, h: number, scale = dpr): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  drawNation(g, n, 0, 0, w, h);
  return c;
}

const grid = document.getElementById('grid')!;
// ?big=GB,KR shows just those flags, large, in 3:2 and 2:1 boxes (for checking details)
const big = new URLSearchParams(location.search).get('big');
if (big) {
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(560px, 1fr))';
  for (const n of big.split(',') as Nation[]) {
    const card = document.createElement('div');
    card.style.cssText = 'display:flex;gap:12px;align-items:center';
    card.append(flagCanvas(n, 240, 160), flagCanvas(n, 300, 150), Object.assign(document.createElement('b'), { textContent: n }));
    grid.append(card);
  }
}
for (const n of big ? [] : NATIONS) {
  const card = document.createElement('div');
  card.className = 'card';
  const small = document.createElement('div');
  small.className = 'small';
  const zoom = flagCanvas(n, 24, 16, 1);
  zoom.className = 'zoom';
  small.append(flagCanvas(n, 24, 16));
  small.insertAdjacentHTML('beforeend', nationImg(n, 24, 16));
  small.append(zoom);
  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `<code>${n}</code>${nationName(n)}`;
  card.append(flagCanvas(n, 96, 64), small, label);
  grid.append(card);
}

const REQUIRED = [
  'Rotterdam', 'Amsterdam', 'Antwerp', 'Zeebrugge', 'Felixstowe', 'Southampton', 'London', 'Tilbury', 'Immingham', 'Grimsby',
  'Harwich', 'Teesport', 'Aberdeen', 'Hull', 'Liverpool', 'Belfast', 'Dublin', 'Cork', 'Hamburg', 'Bremerhaven', 'Bremen',
  'Wilhelmshaven', 'Kiel', 'Duisburg', 'Mannheim', 'Emden', 'Esbjerg', 'Aarhus', 'Copenhagen', 'Skagen', 'Oslo', 'Bergen',
  'Stavanger', 'Tromsø', 'Hammerfest', 'Gothenburg', 'Stockholm', 'Helsinki', 'Tallinn', 'Riga', 'Klaipeda', 'Gdansk',
  'Gdynia', 'St Petersburg', 'Saint Petersburg', 'St. Petersburg', 'Odesa', 'Odessa', 'Constanta', 'Constanța', 'Istanbul',
  'Piraeus', 'Thessaloniki', 'Marsaxlokk', 'Valletta', 'Genoa', 'La Spezia', 'Livorno', 'Naples', 'Gioia Tauro', 'Trieste',
  'Valencia', 'Barcelona', 'Algeciras', 'Bilbao', 'Cadiz', 'Cádiz', 'Malaga', 'Las Palmas', 'Las Palmas de Gran Canaria',
  'Santa Cruz', 'Santa Cruz de Tenerife', 'Lisbon', 'Leixões', 'Leixoes', 'Porto', 'Leixões/Porto', 'Sines', 'Funchal',
  'Le Havre', 'Rouen', 'Nantes', 'Saint-Nazaire', 'St-Nazaire', 'Marseille', 'Dunkirk', 'Cherbourg', 'Brest', 'Bordeaux',
  'Gibraltar', 'Tangier', 'Casablanca', 'Agadir', 'Dakar', 'Banjul', 'Freetown', 'Abidjan', 'Tema', 'Lagos', 'Lomé', 'Lome',
  'Cotonou', 'Mindelo', 'Praia', 'Reykjavik', 'Halifax', "St John's", 'Montreal', 'New York', 'Savannah', 'Boston',
  'Port Said', 'Suez', 'Alexandria', 'Jebel Ali', 'Dubai', 'Singapore', 'Mumbai', 'Chennai', 'Shanghai', 'Busan', 'Yokohama',
  'Tokyo', 'Kaohsiung', 'Monrovia', 'Panama', 'Balboa', 'Colon', 'Colón', 'Santos', 'Buenos Aires', 'Manila',
  'Port of Rotterdam', 'Hamburg (DE)', 'Antwerp-Bruges', 'Montoir-de-Bretagne', 'Port of Tyne',
];
const gamePorts = [...new Set((levels as { ports: { name: string }[] }[]).flatMap((l) => l.ports.map((p) => p.name)))];
const all = [...new Set([...gamePorts, ...REQUIRED])];
const misses = all.filter((p) => !nationOfPort(p));
const ports = document.getElementById('ports')!;
for (const p of all.sort((a, b) => a.localeCompare(b))) {
  const n = nationOfPort(p);
  const d = document.createElement('div');
  d.textContent = `${p} → ${n ?? '??'}`;
  if (!n) d.className = 'bad';
  ports.append(d);
}
document.getElementById('summary')!.innerHTML =
  `${NATIONS.length} flags · ${all.length} port names checked (${gamePorts.length} from levels.json) · ` +
  (misses.length ? `<b class="bad">unknown: ${misses.join(', ')}</b>` : '<b class="ok">all resolve</b>');
