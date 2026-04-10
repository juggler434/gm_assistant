// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Admin Metrics Routes
 *
 * Provides aggregated metrics from application data.
 * Requires authentication.
 */

import type { FastifyInstance } from "fastify";
import { sql, desc, eq } from "drizzle-orm";
import { requireAuth } from "@/modules/auth/index.js";
import { db } from "@/db/index.js";
import { users } from "@/db/schema/users.js";
import { campaigns } from "@/db/schema/campaigns.js";
import { documents } from "@/db/schema/documents.js";
import { chunks } from "@/db/schema/chunks.js";
import { authEvents } from "@/db/schema/auth-events.js";
import { isMetricsEnabled } from "@/services/metrics/index.js";

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  // GET /api/admin/metrics - Aggregated application metrics
  app.get("/", async (_request, reply) => {
    const [
      userMetrics,
      campaignMetrics,
      documentMetrics,
      documentStatusBreakdown,
      chunkMetrics,
    ] = await Promise.all([
      // User counts
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .then((rows) => ({ total_users: rows[0]?.count ?? 0 })),

      // Campaign counts
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(campaigns)
        .then((rows) => ({ total_campaigns: rows[0]?.count ?? 0 })),

      // Document counts and size
      db
        .select({
          count: sql<number>`count(*)::int`,
          total_size: sql<number>`coalesce(sum(file_size), 0)::bigint`,
        })
        .from(documents)
        .then((rows) => ({
          total_documents: rows[0]?.count ?? 0,
          total_document_size_bytes: rows[0]?.total_size ?? 0,
        })),

      // Document status breakdown
      db
        .select({
          status: documents.status,
          count: sql<number>`count(*)::int`,
        })
        .from(documents)
        .groupBy(documents.status)
        .then((rows) => {
          const breakdown: Record<string, number> = {};
          for (const row of rows) {
            breakdown[row.status] = row.count;
          }
          return breakdown;
        }),

      // Chunk counts
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(chunks)
        .then((rows) => ({ total_chunks: rows[0]?.count ?? 0 })),
    ]);

    return reply.status(200).send({
      metrics: {
        users: userMetrics,
        campaigns: campaignMetrics,
        documents: {
          ...documentMetrics,
          by_status: documentStatusBreakdown,
        },
        chunks: chunkMetrics,
        posthog_enabled: isMetricsEnabled(),
      },
      generated_at: new Date().toISOString(),
    });
  });

  // GET /api/admin/metrics/auth-events — Recent auth events with optional filters
  app.get("/auth-events", async (request, reply) => {
    const query = request.query as {
      type?: string;
      limit?: string;
    };

    const limit = Math.min(Math.max(parseInt(query.limit ?? "50", 10) || 50, 1), 200);

    const conditions = [];
    if (query.type) {
      conditions.push(eq(authEvents.eventType, query.type as typeof authEvents.eventType.enumValues[number]));
    }

    const baseQuery = db
      .select({
        id: authEvents.id,
        userId: authEvents.userId,
        eventType: authEvents.eventType,
        ip: authEvents.ip,
        userAgent: authEvents.userAgent,
        metadata: authEvents.metadata,
        createdAt: authEvents.createdAt,
        userEmail: users.email,
      })
      .from(authEvents)
      .leftJoin(users, eq(authEvents.userId, users.id))
      .orderBy(desc(authEvents.createdAt))
      .limit(limit);

    const rows =
      conditions.length > 0
        ? await baseQuery.where(conditions[0]!)
        : await baseQuery;

    return reply.status(200).send({ events: rows });
  });
}
