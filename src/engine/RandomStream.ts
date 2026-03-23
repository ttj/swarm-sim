/**
 * Seeded pseudo-random number generator (xorshift128).
 * Ensures reproducible simulations for the same seed.
 */
export class RandomStream {
  private s: Uint32Array;

  constructor(seed: number = 42) {
    this.s = new Uint32Array(4);
    // Initialize state from seed using splitmix32
    let z = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      z = ((z ^ (z >>> 16)) * 0x45d9f3b) >>> 0;
      z = ((z ^ (z >>> 16)) * 0x45d9f3b) >>> 0;
      z = (z ^ (z >>> 16)) >>> 0;
      this.s[i] = z;
    }
    // Ensure non-zero state
    if (this.s[0] === 0 && this.s[1] === 0 && this.s[2] === 0 && this.s[3] === 0) {
      this.s[0] = 1;
    }
  }

  /** Returns a random float in [0, 1) */
  next(): number {
    const s = this.s;
    let t = s[3];
    t ^= t << 11;
    t ^= t >>> 8;
    s[3] = s[2];
    s[2] = s[1];
    s[1] = s[0];
    const s0 = s[0];
    t ^= s0;
    t ^= s0 >>> 19;
    s[0] = t;
    return (t >>> 0) / 4294967296;
  }

  /** Returns a random integer in [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns true with the given probability [0, 1] */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Pick a random element from an array */
  pick<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }

  /** Shuffle an array in-place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
