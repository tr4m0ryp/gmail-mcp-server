import { test } from "node:test";
import assert from "node:assert/strict";
import { LoginLimiter } from "../src/http/login-limiter.js";

const MINUTE = 60 * 1000;
const LIMITS = {
  maxFailures: 5,
  windowMs: 15 * MINUTE,
  lockoutMs: 15 * MINUTE,
  globalMaxFailures: 0,
};

function clock(start = 1_000_000) {
  const c = { t: start, now: () => c.t };
  return c;
}

test("locks an IP on the fifth failure and reports Retry-After", () => {
  const c = clock();
  const limiter = new LoginLimiter(LIMITS, c.now);
  for (let i = 1; i <= 4; i++) {
    assert.deepEqual(limiter.recordFailure("1.1.1.1"), { blocked: false, remaining: 5 - i });
  }
  assert.deepEqual(limiter.recordFailure("1.1.1.1"), { blocked: true, retryAfterMs: 15 * MINUTE });
  c.t += 5 * MINUTE;
  assert.deepEqual(limiter.check("1.1.1.1"), { blocked: true, retryAfterMs: 10 * MINUTE });
});

test("lockout is per IP", () => {
  const limiter = new LoginLimiter(LIMITS, clock().now);
  for (let i = 0; i < 5; i++) limiter.recordFailure("1.1.1.1");
  assert.equal(limiter.check("1.1.1.1").blocked, true);
  assert.deepEqual(limiter.check("2.2.2.2"), { blocked: false, remaining: 5 });
});

test("lockout expires and the counter starts fresh", () => {
  const c = clock();
  const limiter = new LoginLimiter(LIMITS, c.now);
  for (let i = 0; i < 5; i++) limiter.recordFailure("1.1.1.1");
  c.t += 15 * MINUTE;
  assert.deepEqual(limiter.check("1.1.1.1"), { blocked: false, remaining: 5 });
});

test("failures outside the sliding window do not count", () => {
  const c = clock();
  const limiter = new LoginLimiter(LIMITS, c.now);
  for (let i = 0; i < 4; i++) limiter.recordFailure("1.1.1.1");
  c.t += 16 * MINUTE;
  assert.deepEqual(limiter.recordFailure("1.1.1.1"), { blocked: false, remaining: 4 });
});

test("success resets the IP's counter", () => {
  const limiter = new LoginLimiter(LIMITS, clock().now);
  for (let i = 0; i < 4; i++) limiter.recordFailure("1.1.1.1");
  limiter.recordSuccess("1.1.1.1");
  assert.deepEqual(limiter.check("1.1.1.1"), { blocked: false, remaining: 5 });
});

test("global cap blocks every IP until the oldest failure ages out", () => {
  const c = clock();
  const limiter = new LoginLimiter({ ...LIMITS, globalMaxFailures: 3 }, c.now);
  limiter.recordFailure("1.1.1.1");
  c.t += MINUTE;
  limiter.recordFailure("2.2.2.2");
  assert.equal(limiter.check("9.9.9.9").blocked, false);
  limiter.recordFailure("3.3.3.3");
  assert.deepEqual(limiter.check("9.9.9.9"), { blocked: true, retryAfterMs: 14 * MINUTE });
  c.t += 14 * MINUTE;
  assert.equal(limiter.check("9.9.9.9").blocked, false);
});

test("stale records are pruned so the table stays bounded", () => {
  const c = clock();
  const limiter = new LoginLimiter(LIMITS, c.now);
  for (let i = 0; i < 100; i++) limiter.recordFailure(`10.0.0.${i}`);
  assert.equal(limiter.size, 100);
  c.t += 16 * MINUTE;
  limiter.recordFailure("1.1.1.1");
  assert.equal(limiter.size, 1);
});
