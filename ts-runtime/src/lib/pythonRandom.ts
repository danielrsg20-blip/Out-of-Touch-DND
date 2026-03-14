export class PythonRandom {
  private static readonly N = 624
  private static readonly M = 397
  private static readonly MATRIX_A = 0x9908b0df
  private static readonly UPPER_MASK = 0x80000000
  private static readonly LOWER_MASK = 0x7fffffff
  private mt: number[] = new Array<number>(PythonRandom.N).fill(0)
  private mti = PythonRandom.N + 1

  constructor(seed: number) {
    this.seed(seed)
  }

  private initGenRand(seed: number): void {
    this.mt[0] = seed >>> 0
    for (this.mti = 1; this.mti < PythonRandom.N; this.mti += 1) {
      const prev = this.mt[this.mti - 1] ?? 0
      const x = prev ^ (prev >>> 30)
      this.mt[this.mti] = (Math.imul(1812433253, x) + this.mti) >>> 0
    }
  }

  // Matches CPython's init_by_array path used for integer seeding.
  private initByArray(key: number[]): void {
    this.initGenRand(19650218)
    let i = 1
    let j = 0
    let k = PythonRandom.N > key.length ? PythonRandom.N : key.length

    while (k > 0) {
      const prev = this.mt[i - 1] ?? 0
      const x = prev ^ (prev >>> 30)
      const v = ((this.mt[i] ?? 0) ^ Math.imul(x, 1664525)) + (key[j] ?? 0) + j
      this.mt[i] = v >>> 0
      i += 1
      j += 1
      if (i >= PythonRandom.N) {
        this.mt[0] = this.mt[PythonRandom.N - 1] ?? 0
        i = 1
      }
      if (j >= key.length) {
        j = 0
      }
      k -= 1
    }

    k = PythonRandom.N - 1
    while (k > 0) {
      const prev = this.mt[i - 1] ?? 0
      const x = prev ^ (prev >>> 30)
      const v = ((this.mt[i] ?? 0) ^ Math.imul(x, 1566083941)) - i
      this.mt[i] = v >>> 0
      i += 1
      if (i >= PythonRandom.N) {
        this.mt[0] = this.mt[PythonRandom.N - 1] ?? 0
        i = 1
      }
      k -= 1
    }

    this.mt[0] = 0x80000000
  }

  seed(seed: number): void {
    const s = Math.abs(Math.trunc(seed)) >>> 0
    this.initByArray([s])
  }

  private genRandInt32(): number {
    const mag01 = [0x0, PythonRandom.MATRIX_A]
    let y = 0

    if (this.mti >= PythonRandom.N) {
      for (let kk = 0; kk < PythonRandom.N - PythonRandom.M; kk += 1) {
        y = ((this.mt[kk] ?? 0) & PythonRandom.UPPER_MASK) | ((this.mt[kk + 1] ?? 0) & PythonRandom.LOWER_MASK)
        this.mt[kk] = (this.mt[kk + PythonRandom.M] ?? 0) ^ (y >>> 1) ^ (mag01[y & 0x1] ?? 0)
      }
      for (let kk = PythonRandom.N - PythonRandom.M; kk < PythonRandom.N - 1; kk += 1) {
        y = ((this.mt[kk] ?? 0) & PythonRandom.UPPER_MASK) | ((this.mt[kk + 1] ?? 0) & PythonRandom.LOWER_MASK)
        this.mt[kk] = (this.mt[kk + (PythonRandom.M - PythonRandom.N)] ?? 0) ^ (y >>> 1) ^ (mag01[y & 0x1] ?? 0)
      }
      y = ((this.mt[PythonRandom.N - 1] ?? 0) & PythonRandom.UPPER_MASK) | ((this.mt[0] ?? 0) & PythonRandom.LOWER_MASK)
      this.mt[PythonRandom.N - 1] = (this.mt[PythonRandom.M - 1] ?? 0) ^ (y >>> 1) ^ (mag01[y & 0x1] ?? 0)
      this.mti = 0
    }

    y = this.mt[this.mti] ?? 0
    this.mti += 1

    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18

    return y >>> 0
  }

  // CPython random(): combine 27 and 26 bits into 53-bit float.
  random(): number {
    const a = this.genRandInt32() >>> 5
    const b = this.genRandInt32() >>> 6
    return (a * 67108864 + b) / 9007199254740992
  }

  getrandbits(k: number): number {
    if (k <= 0) {
      return 0
    }
    if (k <= 32) {
      return this.genRandInt32() >>> (32 - k)
    }

    let bits = 0
    let shift = 0
    let remaining = k
    while (remaining > 0) {
      const take = Math.min(remaining, 32)
      const chunk = this.genRandInt32() >>> (32 - take)
      bits += chunk * (2 ** shift)
      shift += take
      remaining -= take
    }
    return bits
  }

  private randbelow(n: number): number {
    if (n <= 0) {
      return 0
    }
    const k = Math.ceil(Math.log2(n))
    let r = this.getrandbits(k)
    while (r >= n) {
      r = this.getrandbits(k)
    }
    return r
  }

  uniform(a: number, b: number): number {
    return a + (b - a) * this.random()
  }

  randint(a: number, b: number): number {
    return this.randbelow(b - a + 1) + a
  }

  choice<T>(arr: T[]): T {
    return arr[this.randbelow(arr.length)] as T
  }
}