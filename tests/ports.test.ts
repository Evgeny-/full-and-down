import { describe, expect, it } from 'vitest';
import levels from '../src/data/levels.json';
import { AREA_PORTS } from '../src/core/ports';
import { PORT_TABLE, norm } from '../src/render/ports/registry';
import { LANDMARKS } from '../src/render/ports/landmarks';
import '../src/render/ports/table';

const names = [...new Set([...(levels as Array<{ ports: Array<{ name: string }> }>).flatMap((l) => l.ports.map((p) => p.name)), ...AREA_PORTS.flat().map((p) => p.name)])];

describe('port scenes', () => {
  it('knows every port of the game', () => {
    const missing = names.filter((n) => !PORT_TABLE[norm(n)]);
    expect(missing).toEqual([]);
  });

  it('only refers to landmarks that exist', () => {
    const bad = Object.entries(PORT_TABLE)
      .filter(([, e]) => e.landmark && !LANDMARKS[e.landmark])
      .map(([n, e]) => `${n}:${e.landmark}`);
    expect(bad).toEqual([]);
  });

  it('normalises names without accents or punctuation', () => {
    expect(norm('Liège')).toBe('liege');
    expect(norm("St John's")).toBe('stjohns');
    expect(norm('Tromsø')).toBe('tromso');
    expect(norm('Ålesund')).toBe('alesund');
  });
});
