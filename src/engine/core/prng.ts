/**
 * Seeded pseudo-random numbers (xoshiro128**, seeded via splitmix32). The
 * same seed always gives the same sequence, which makes runs reproducible.
 */

export type Rng = {
  readonly seed: number;
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform 32-bit unsigned integer. */
  nextUint32(): number;
  /**
   * An independent stream derived from this seed and a label (e.g. a
   * component id), so adding one component doesn't change the randomness
   * any other component sees.
   */
  fork(label: string): Rng;
};

const TWO_POW_32 = 2 ** 32;

function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let t = state ^ (state >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/** FNV-1a over a string, mixed with a seed. */
export function hashString(text: string, seed = 0): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const rotl = (x: number, k: number) => (x << k) | (x >>> (32 - k));

export function createRng(seed: number): Rng {
  const init = splitmix32(seed);
  let s0 = init();
  let s1 = init();
  let s2 = init();
  let s3 = init();

  const nextUint32 = () => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  };

  return {
    seed,
    nextUint32,
    next: () => nextUint32() / TWO_POW_32,
    fork: (label) => createRng(hashString(label, seed)),
  };
}
