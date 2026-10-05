/**
 * Generatore pseudo-casuale deterministico (sfc32). Il motore non usa mai Math.random:
 * stesso seed = stessa sequenza, così ogni partita è riproducibile e verificabile.
 */
export interface Rng {
  /** Intero senza segno a 32 bit. */
  nextUint32(): number;
  /** Numero in [0, 1). */
  next(): number;
  /** Intero uniforme in [min, max], estremi inclusi. */
  int(min: number, max: number): number;
  /** true con probabilità p. */
  chance(p: number): boolean;
}

const UINT32_RANGE = 2 ** 32;

export function createRng(seed: string): Rng {
  const seedNext = splitmix32(fnv1a32(seed));
  let a = seedNext();
  let b = seedNext();
  let c = seedNext();
  let d = seedNext();

  const nextUint32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };

  for (let i = 0; i < 15; i++) {
    nextUint32();
  }

  const next = (): number => nextUint32() / UINT32_RANGE;

  return {
    nextUint32,
    next,
    int(min, max) {
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
        throw new RangeError(`Intervallo non valido: [${min}, ${max}]`);
      }
      const span = max - min + 1;
      if (span > UINT32_RANGE) {
        throw new RangeError(`Intervallo troppo ampio: [${min}, ${max}]`);
      }
      // Campionamento con rifiuto: nessuna distorsione verso i valori bassi.
      const limit = Math.floor(UINT32_RANGE / span) * span;
      let value = nextUint32();
      while (value >= limit) {
        value = nextUint32();
      }
      return min + (value % span);
    },
    chance(p) {
      if (!(p >= 0 && p <= 1)) {
        throw new RangeError(`Probabilità non valida: ${p}`);
      }
      return next() < p;
    },
  };
}

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}
