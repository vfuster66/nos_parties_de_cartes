/** Seau à jetons : `capacity` actions en rafale, puis `refillPerSec` par seconde. */
export class TokenBucket {
  private tokens: number
  private last: number
  constructor(
    private capacity: number,
    private refillPerSec: number,
    private now: () => number = Date.now,
  ) {
    this.tokens = capacity
    this.last = now()
  }
  take(): boolean {
    const t = this.now()
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSec)
    this.last = t
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}

/** Compte des événements par clé sur une fenêtre glissante (ex. échecs de recherche de code par adresse IP). */
export class SlidingCounter {
  private hits = new Map<string, number[]>()
  constructor(
    private max: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}
  private prune(key: string): number[] {
    const t = this.now()
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs)
    if (list.length) this.hits.set(key, list)
    else this.hits.delete(key)
    return list
  }
  isBlocked(key: string): boolean {
    return this.prune(key).length >= this.max
  }
  record(key: string): void {
    const list = this.prune(key)
    list.push(this.now())
    this.hits.set(key, list)
  }
  /** Libère la mémoire des clés inactives. */
  sweep(): void {
    for (const k of [...this.hits.keys()]) this.prune(k)
  }
}
