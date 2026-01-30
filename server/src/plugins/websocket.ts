import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket);
}
