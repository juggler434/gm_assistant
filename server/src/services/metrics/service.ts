/**
 * Metrics Service
 *
 * Provides a consistent interface for tracking analytics events via PostHog.
 * When PostHog is not configured (no API key), all operations are no-ops
 * so the application runs normally without metrics.
 */

import { PostHog } from "posthog-node";
import { config } from "@/config/index.js";

// ============================================================================
// Types
// ============================================================================

export interface MetricsEventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

// ============================================================================
// Singleton PostHog client
// ============================================================================

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;

  const apiKey = config.posthog.apiKey;
  if (!apiKey) return null;

  const options: { host?: string } = {};
  if (config.posthog.host) {
    options.host = config.posthog.host;
  }

  client = new PostHog(apiKey, options);
  return client;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Track an analytics event. Fails silently if PostHog is not configured
 * or if the capture call throws.
 */
export function trackEvent(
  distinctId: string,
  event: string,
  properties?: MetricsEventProperties,
): void {
  try {
    const ph = getClient();
    if (!ph) return;

    const msg: { distinctId: string; event: string; properties?: Record<string | number, unknown> } = {
      distinctId,
      event,
    };
    if (properties) {
      msg.properties = properties;
    }
    ph.capture(msg);
  } catch {
    // Failed metrics tracking must never block operations
  }
}

/**
 * Identify a user and set their properties in PostHog.
 */
export function identifyUser(
  distinctId: string,
  properties?: MetricsEventProperties,
): void {
  try {
    const ph = getClient();
    if (!ph) return;

    const msg: { distinctId: string; properties?: Record<string | number, unknown> } = {
      distinctId,
    };
    if (properties) {
      msg.properties = properties;
    }
    ph.identify(msg);
  } catch {
    // Failed metrics tracking must never block operations
  }
}

/**
 * Track a timed operation. Returns a function to call when the operation
 * completes, which captures the duration automatically.
 */
export function trackTimed(
  distinctId: string,
  event: string,
  properties?: MetricsEventProperties,
): (additionalProperties?: MetricsEventProperties) => void {
  const startTime = Date.now();
  return (additionalProperties?: MetricsEventProperties) => {
    const durationMs = Date.now() - startTime;
    trackEvent(distinctId, event, {
      ...properties,
      ...additionalProperties,
      duration_ms: durationMs,
    });
  };
}

/**
 * Check whether metrics tracking is enabled (PostHog API key is configured).
 */
export function isMetricsEnabled(): boolean {
  return !!config.posthog.apiKey;
}

/**
 * Flush pending events and shut down the PostHog client gracefully.
 * Should be called during application shutdown.
 */
export async function shutdownMetrics(): Promise<void> {
  if (client) {
    try {
      await client.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    client = null;
  }
}
