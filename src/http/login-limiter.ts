import type { LoginLimits } from "../config.js";

// ---------------------------------------------------------------------------
// Failed admin-login throttling — in-memory, single instance.
//
// Per client IP: `maxFailures` failures inside a sliding `windowMs` lock that
// IP out for `lockoutMs`. Globally: `globalMaxFailures` failures across all
// IPs inside `windowMs` block every attempt until the oldest one ages out,
// which slows distributed guessing. A successful login clears the caller's
// record. Memory is bounded: stale records are pruned and the table capped.
// ---------------------------------------------------------------------------

const MAX_TRACKED_IPS = 10_000;
const PRUNE_INTERVAL_MS = 60 * 1000;

interface IpRecord {
  /** Failure timestamps inside the window, oldest first. */
  failures: number[];
  lockedUntil: number;
}

export type LimitStatus =
  | { blocked: false; remaining: number }
  | { blocked: true; retryAfterMs: number };

export class LoginLimiter {
  private readonly ips = new Map<string, IpRecord>();
  private global: number[] = [];
  private lastPrune = 0;

  constructor(
    private readonly limits: LoginLimits,
    private readonly now: () => number = Date.now
  ) {}

  /** Whether `ip` may attempt a login right now (call before checking the key). */
  check(ip: string): LimitStatus {
    const t = this.now();
    const rec = this.ips.get(ip);
    if (rec && rec.lockedUntil > t) {
      return { blocked: true, retryAfterMs: rec.lockedUntil - t };
    }
    const globalWait = this.globalWait(t);
    if (globalWait > 0) return { blocked: true, retryAfterMs: globalWait };
    const used = rec ? this.live(rec.failures, t).length : 0;
    return { blocked: false, remaining: this.limits.maxFailures - used };
  }

  /** Count a wrong key from `ip`; reports whether that tripped a lockout. */
  recordFailure(ip: string): LimitStatus {
    const t = this.now();
    this.prune(t);

    if (this.limits.globalMaxFailures > 0) {
      this.global = this.live(this.global, t);
      this.global.push(t);
      if (this.global.length > this.limits.globalMaxFailures) {
        this.global.splice(0, this.global.length - this.limits.globalMaxFailures);
      }
    }

    const rec = this.ips.get(ip) ?? { failures: [], lockedUntil: 0 };
    this.ips.delete(ip); // re-insert below so Map order tracks recency
    rec.failures = this.live(rec.failures, t);
    rec.failures.push(t);
    if (rec.failures.length >= this.limits.maxFailures) {
      rec.failures = [];
      rec.lockedUntil = t + this.limits.lockoutMs;
    }
    this.store(ip, rec);

    return this.check(ip);
  }

  /** A correct key resets that IP's failure count. */
  recordSuccess(ip: string): void {
    this.ips.delete(ip);
  }

  /** Number of IPs currently tracked (for tests / diagnostics). */
  get size(): number {
    return this.ips.size;
  }

  private store(ip: string, rec: IpRecord): void {
    while (this.ips.size >= MAX_TRACKED_IPS) {
      const oldest = this.ips.keys().next().value;
      if (oldest === undefined) break;
      this.ips.delete(oldest);
    }
    this.ips.set(ip, rec);
  }

  private globalWait(t: number): number {
    const max = this.limits.globalMaxFailures;
    if (max <= 0) return 0;
    const live = this.live(this.global, t);
    if (live.length < max) return 0;
    return live[live.length - max] + this.limits.windowMs - t;
  }

  private live(failures: number[], t: number): number[] {
    const cutoff = t - this.limits.windowMs;
    return failures.filter((at) => at > cutoff);
  }

  /** Drop records with no active lockout and no failures left in the window. */
  private prune(t: number): void {
    if (t - this.lastPrune < PRUNE_INTERVAL_MS && this.ips.size < MAX_TRACKED_IPS) {
      return;
    }
    this.lastPrune = t;
    for (const [ip, rec] of this.ips) {
      if (rec.lockedUntil <= t && this.live(rec.failures, t).length === 0) {
        this.ips.delete(ip);
      }
    }
  }
}
