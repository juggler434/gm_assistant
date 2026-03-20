// SPDX-License-Identifier: AGPL-3.0-or-later

import type { WebSocket } from "@fastify/websocket";
import type { TranscriptSegment, TranscriptMarker } from "@gm-assistant/shared";

/** Client → Server message types */

export interface StartMessage {
  event: "start";
  title?: string | undefined;
  saveAudio?: boolean | undefined;
}

export interface AudioMessage {
  event: "audio";
  data: string; // base64-encoded audio chunk
}

export interface MarkerMessage {
  event: "marker";
  label: string;
  type?: string | undefined;
  notes?: string | undefined;
}

export interface StopMessage {
  event: "stop";
}

export type ClientMessage =
  | StartMessage
  | AudioMessage
  | MarkerMessage
  | StopMessage;

/** Server → Client message types */

export interface ReadyMessage {
  event: "ready";
  sessionId: string;
}

export interface TranscriptMessage {
  event: "transcript";
  text: string;
  fullText: string;
  segments: TranscriptSegment[];
  isFinal: boolean;
}

export interface StoppedMessage {
  event: "stopped";
  sessionId: string;
  transcript: string;
}

export interface MarkerAddedMessage {
  event: "marker_added";
  marker: TranscriptMarker;
}

export interface ErrorMessage {
  event: "error";
  code: string;
  message: string;
}

export type ServerMessage =
  | ReadyMessage
  | TranscriptMessage
  | StoppedMessage
  | MarkerAddedMessage
  | ErrorMessage;

/** Per-connection state for a live transcription session */
export interface LiveSessionState {
  sessionId: string | null;
  campaignId: string;
  userId: string;

  audioBuffer: Buffer[];
  allAudioChunks: Buffer[];

  segments: TranscriptSegment[];
  markers: TranscriptMarker[];
  fullTranscript: string;
  currentOffset: number;

  saveAudio: boolean;
  isRecording: boolean;
  whisperInFlight: boolean;

  recordingStartTime: number;
  lastFlushTime: number;

  inactivityTimer: ReturnType<typeof setTimeout> | null;
  warningTimer: ReturnType<typeof setTimeout> | null;
}

/** Active sessions tracked per campaign */
export type ActiveSessionMap = Map<string, WebSocket>;
