// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/index.js", () => {
  const insertReturning = vi.fn().mockResolvedValue([{ id: "event-1" }]);
  const insertValues = vi.fn(() => ({ catch: vi.fn() }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const deleteReturning = vi.fn().mockResolvedValue([{ id: "event-1" }]);
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }));
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  return {
    db: {
      insert: insert,
      delete: deleteFn,
    },
    __mocks: { insert, insertValues, deleteFn, deleteWhere, deleteReturning },
  };
});

import { db } from "@/db/index.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (await import("@/db/index.js") as any).__mocks;
import { authEvents } from "@/db/schema/auth-events.js";
import { recordAuthEvent, purgeOldAuthEvents } from "@/modules/auth/audit-log.js";
import type { FastifyRequest } from "fastify";

function makeFakeRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    headers: {
      "user-agent": "TestAgent/1.0",
    },
    ip: "127.0.0.1",
    log: {
      error: vi.fn(),
    },
    ...overrides,
  } as unknown as FastifyRequest;
}

describe("recordAuthEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should insert an auth event with correct fields", () => {
    const request = makeFakeRequest();

    recordAuthEvent({
      userId: "user-123",
      eventType: "login_success",
      request,
    });

    expect(db.insert).toHaveBeenCalledWith(authEvents);
    expect(mocks.insertValues).toHaveBeenCalledWith({
      userId: "user-123",
      eventType: "login_success",
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
      metadata: {},
    });
  });

  it("should allow null userId for failed logins", () => {
    const request = makeFakeRequest();

    recordAuthEvent({
      userId: null,
      eventType: "login_failure",
      request,
      metadata: { email: "unknown@example.com", reason: "unknown_email" },
    });

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        eventType: "login_failure",
        metadata: { email: "unknown@example.com", reason: "unknown_email" },
      })
    );
  });

  it("should use x-forwarded-for header when present", () => {
    const request = makeFakeRequest({
      headers: {
        "x-forwarded-for": "203.0.113.50, 70.41.3.18",
        "user-agent": "TestAgent/1.0",
      },
    } as unknown as Partial<FastifyRequest>);

    recordAuthEvent({
      userId: "user-123",
      eventType: "logout",
      request,
    });

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "203.0.113.50" })
    );
  });

  it("should truncate long user agent strings", () => {
    const longUA = "A".repeat(600);
    const request = makeFakeRequest({
      headers: {
        "user-agent": longUA,
      },
    } as unknown as Partial<FastifyRequest>);

    recordAuthEvent({
      userId: "user-123",
      eventType: "register",
      request,
    });

    const callArgs = mocks.insertValues.mock.calls[0][0];
    expect(callArgs.userAgent.length).toBe(512);
  });
});

describe("purgeOldAuthEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete events older than the retention period", async () => {
    const count = await purgeOldAuthEvents(90);

    expect(db.delete).toHaveBeenCalledWith(authEvents);
    expect(mocks.deleteWhere).toHaveBeenCalled();
    expect(count).toBe(1);
  });

  it("should default to 90 days retention", async () => {
    await purgeOldAuthEvents();

    expect(db.delete).toHaveBeenCalledWith(authEvents);
  });
});
