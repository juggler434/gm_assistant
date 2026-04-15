// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, beforeEach, vi } from "vitest";

class FakeRedis {
  strings = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  ttls = new Map<string, number>();

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<"OK"> {
    this.strings.set(key, value);
    if (mode === "EX" && typeof ttl === "number") this.ttls.set(key, ttl);
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    return this.strings.has(key) ? this.strings.get(key)! : null;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.strings.delete(key)) count++;
      else if (this.sets.delete(key)) count++;
      this.ttls.delete(key);
    }
    return count;
  }

  async expire(key: string, ttl: number): Promise<number> {
    if (this.strings.has(key) || this.sets.has(key)) {
      this.ttls.set(key, ttl);
      return 1;
    }
    return 0;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set();
      this.sets.set(key, set);
    }
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    }
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const m of members) {
      if (set.delete(m)) removed++;
    }
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    return set ? [...set] : [];
  }

  async scard(key: string): Promise<number> {
    return this.sets.get(key)?.size ?? 0;
  }

  async ttl(key: string): Promise<number> {
    return this.ttls.get(key) ?? -1;
  }

  pipeline(): FakePipeline {
    return new FakePipeline(this);
  }
}

class FakePipeline {
  private ops: Array<() => Promise<unknown>> = [];

  constructor(private redis: FakeRedis) {}

  set(...args: Parameters<FakeRedis["set"]>): this {
    this.ops.push(() => this.redis.set(...args));
    return this;
  }

  del(...keys: string[]): this {
    this.ops.push(() => this.redis.del(...keys));
    return this;
  }

  expire(key: string, ttl: number): this {
    this.ops.push(() => this.redis.expire(key, ttl));
    return this;
  }

  sadd(key: string, ...members: string[]): this {
    this.ops.push(() => this.redis.sadd(key, ...members));
    return this;
  }

  srem(key: string, ...members: string[]): this {
    this.ops.push(() => this.redis.srem(key, ...members));
    return this;
  }

  async exec(): Promise<Array<[Error | null, unknown]>> {
    const results: Array<[Error | null, unknown]> = [];
    for (const op of this.ops) {
      try {
        results.push([null, await op()]);
      } catch (e) {
        results.push([e as Error, null]);
      }
    }
    return results;
  }
}

const fakeRedis = new FakeRedis();

vi.mock("@/jobs/connection.js", () => ({
  createRedisConnection: vi.fn(() => fakeRedis),
}));

const {
  createSession,
  validateSessionToken,
  invalidateSession,
  invalidateAllUserSessions,
} = await import("@/modules/auth/session.js");

function userSessionsKey(userId: string): string {
  return `user:${userId}:sessions`;
}

describe("Session Redis integration", () => {
  beforeEach(() => {
    fakeRedis.strings.clear();
    fakeRedis.sets.clear();
    fakeRedis.ttls.clear();
  });

  describe("createSession", () => {
    it("adds the session id to the user sessions set", async () => {
      const userId = "user-1";
      const result = await createSession(userId);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const members = await fakeRedis.smembers(userSessionsKey(userId));
      expect(members).toEqual([result.value.session.id]);
    });

    it("sets matching TTLs on the session key and user set", async () => {
      const result = await createSession("user-1");
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sessionTtl = await fakeRedis.ttl(`session:${result.value.session.id}`);
      const setTtl = await fakeRedis.ttl(userSessionsKey("user-1"));

      expect(sessionTtl).toBeGreaterThan(0);
      expect(setTtl).toBe(sessionTtl);
    });

    it("tracks multiple sessions for the same user", async () => {
      const a = await createSession("user-1");
      const b = await createSession("user-1");
      const c = await createSession("user-1");

      expect(a.ok && b.ok && c.ok).toBe(true);
      if (!a.ok || !b.ok || !c.ok) return;

      const members = await fakeRedis.smembers(userSessionsKey("user-1"));
      expect(members.sort()).toEqual(
        [a.value.session.id, b.value.session.id, c.value.session.id].sort()
      );
    });
  });

  describe("invalidateSession", () => {
    it("removes the session id from the user set", async () => {
      const created = await createSession("user-1");
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const sessionId = created.value.session.id;
      const result = await invalidateSession(sessionId);
      expect(result.ok).toBe(true);

      expect(await fakeRedis.get(`session:${sessionId}`)).toBeNull();
      expect(await fakeRedis.smembers(userSessionsKey("user-1"))).toEqual([]);
    });

    it("leaves other sessions in the user set intact", async () => {
      const keep = await createSession("user-1");
      const drop = await createSession("user-1");
      expect(keep.ok && drop.ok).toBe(true);
      if (!keep.ok || !drop.ok) return;

      await invalidateSession(drop.value.session.id);

      const members = await fakeRedis.smembers(userSessionsKey("user-1"));
      expect(members).toEqual([keep.value.session.id]);
    });

    it("is a no-op when the session does not exist", async () => {
      const result = await invalidateSession("nonexistent");
      expect(result.ok).toBe(true);
    });
  });

  describe("invalidateAllUserSessions", () => {
    it("deletes every session key listed in the user set and the set itself", async () => {
      const a = await createSession("user-1");
      const b = await createSession("user-1");
      const other = await createSession("user-2");
      expect(a.ok && b.ok && other.ok).toBe(true);
      if (!a.ok || !b.ok || !other.ok) return;

      const result = await invalidateAllUserSessions("user-1");
      expect(result.ok).toBe(true);

      expect(await fakeRedis.get(`session:${a.value.session.id}`)).toBeNull();
      expect(await fakeRedis.get(`session:${b.value.session.id}`)).toBeNull();
      expect(await fakeRedis.smembers(userSessionsKey("user-1"))).toEqual([]);

      expect(await fakeRedis.get(`session:${other.value.session.id}`)).not.toBeNull();
      expect(await fakeRedis.smembers(userSessionsKey("user-2"))).toEqual([
        other.value.session.id,
      ]);
    });

    it("does not SCAN across all sessions", async () => {
      const scanSpy = vi.fn();
      (fakeRedis as unknown as { scan: typeof scanSpy }).scan = scanSpy;

      await createSession("user-1");
      await invalidateAllUserSessions("user-1");

      expect(scanSpy).not.toHaveBeenCalled();
    });

    it("succeeds when the user has no sessions", async () => {
      const result = await invalidateAllUserSessions("ghost");
      expect(result.ok).toBe(true);
    });
  });

  describe("validateSessionToken", () => {
    it("refreshes TTL on both the session key and user set", async () => {
      const created = await createSession("user-1");
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      fakeRedis.ttls.set(`session:${created.value.session.id}`, 1);
      fakeRedis.ttls.set(userSessionsKey("user-1"), 1);

      const result = await validateSessionToken(created.value.token);
      expect(result.ok).toBe(true);

      const sessionTtl = await fakeRedis.ttl(`session:${created.value.session.id}`);
      const setTtl = await fakeRedis.ttl(userSessionsKey("user-1"));
      expect(sessionTtl).toBeGreaterThan(1);
      expect(setTtl).toBe(sessionTtl);
    });
  });
});
