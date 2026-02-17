// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Metrics Plugin
 *
 * Fastify plugin that tracks request latency and response status codes
 * for all API endpoints via PostHog.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { trackEvent } from "@/services/metrics/index.js";

const requestStartTimes = new WeakMap<FastifyRequest, number>();

async function metricsPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request) => {
    requestStartTimes.set(request, Date.now());
  });

  app.addHook("onResponse", async (request, reply) => {
    const startTime = requestStartTimes.get(request);
    if (startTime === undefined) return;

    const durationMs = Date.now() - startTime;
    const distinctId = request.userId ?? "anonymous";

    trackEvent(distinctId, "api_request", {
      method: request.method,
      route: request.routeOptions?.url ?? request.url,
      status_code: reply.statusCode,
      duration_ms: durationMs,
    });
  });
}

export const registerMetrics = fp(metricsPlugin, {
  name: "metrics",
});
