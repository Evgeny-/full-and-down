const KEY = 'full-and-down/save/v1';

export interface LevelRecord {
  stars: number;
  profit: number;
}

export interface SaveData {
  levels: Record<number, LevelRecord>;
  /** pilot tokens (hints) */
  pilots: number;
  /** intro notices already read */
  seen: string[];
  settings: { sfx: number; music: number; night: 'auto' | 'on' | 'off' };
}

function fresh(): SaveData {
  return { levels: {}, pilots: 3, seen: [], settings: { sfx: 0.9, music: 0.5, night: 'off' } };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = { ...fresh(), ...JSON.parse(raw) } as SaveData;
    data.settings = { ...fresh().settings, ...data.settings };
    return data;
  } catch {
    return fresh();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode: progress lives for this session only */
  }
}

export function resetSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The highest level the player may open (1-based). */
export function unlockedUpTo(data: SaveData, total: number): number {
  let n = 1;
  while (n <= total && data.levels[n]?.stars) n++;
  return Math.min(total, n);
}
