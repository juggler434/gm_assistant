// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyRequest } from "fastify";
import { db } from "@/db/index.js";
import { authEvents, type AuthEventType } from "@/db/schema/auth-events.js";
import { lt } from "drizzle-orm";

interface AuditLogOptions {
  userId?: string | null;
  eventType: AuthEventType;
  request: FastifyRequest;
  metadata?: Record<string, unknown>;
}

/**
 * Record an authentication event in the audit log.
 * Fire-and-forget — failures are logged but never block the request.
 */
export function recordAuthEvent(options: AuditLogOptions): void {
  const { userId, eventType, request, metadata } = options;

  const ip =
    request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ??
    request.ip;
  const userAgent = request.headers["user-agent"]?.slice(0, 512) ?? null;

  db.insert(authEvents)
    .values({
      userId: userId ?? null,
      eventType,
      ip,
      userAgent,
      metadata: metadata ?? {},
    })
    .catch((error) => {
      request.log.error({ error, eventType }, "Failed to record auth event");
    });
}

/**
 * Delete auth events older than the given number of days.
 * Returns the count of deleted rows.
 */
export async function purgeOldAuthEvents(
  retentionDays: number = 90
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const result = await db
    .delete(authEvents)
    .where(lt(authEvents.createdAt, cutoff))
    .returning({ id: authEvents.id });

  return result.length;
}
