// SPDX-License-Identifier: AGPL-3.0-or-later

import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket, {
    options: {
      // Allow large messages for final audio upload (up to 500MB)
      maxPayload: 500 * 1024 * 1024,
    },
  });
}
