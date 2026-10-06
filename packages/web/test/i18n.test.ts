import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../src/locales/en';
import { it as itDict } from '../src/locales/it';

const engineSrc = join(import.meta.dirname, '../../engine/src');

function engineSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? engineSources(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [readFileSync(join(dir, entry.name), 'utf8')]
        : [],
  );
}

describe('traduzioni', () => {
  it('italiano e inglese hanno le stesse chiavi', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(itDict).sort());
  });

  it('ogni chiave di rapporto, causa, carta e sblocco prodotta dal motore è tradotta', () => {
    const keys = new Set<string>();
    for (const source of engineSources(engineSrc)) {
      for (const match of source.matchAll(/'((?:report|why|card|unlock)\.[A-Za-z]+)'/g)) {
        if (match[1] !== undefined) keys.add(match[1]);
      }
    }
    expect(keys.size).toBeGreaterThan(20);
    const missing = [...keys].filter((key) => itDict[key] === undefined || en[key] === undefined);
    expect(missing).toEqual([]);
  });

  it('i segnaposto coincidono tra le lingue', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of Object.entries(itDict)) {
      expect(placeholders(en[key] ?? ''), key).toEqual(placeholders(value));
    }
  });
});
