// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAudioRecorder } from "./use-audio-recorder";
import { sessionKeys } from "./use-sessions";
import type { TranscriptSegment, TranscriptMarker } from "@/types";

export type LiveSessionState =
  | "idle"
  | "connecting"
  | "recording"
  | "paused"
  | "stopping"
  | "stopped"
  | "error";

interface ServerMessage {
  event: string;
  sessionId?: string;
  text?: string;
  fullText?: string;
  segments?: TranscriptSegment[];
  isFinal?: boolean;
  transcript?: string;
  marker?: TranscriptMarker;
  code?: string;
  message?: string;
}

interface UseLiveSessionOptions {
  campaignId: string;
}

interface UseLiveSessionReturn {
  state: LiveSessionState;
  error: string | null;
  sessionId: string | null;
  transcript: string;
  segments: TranscriptSegment[];
  markers: TranscriptMarker[];
  elapsedTime: number;
  startRecording: (title?: string) => void;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  addMarker: (label: string, type?: string, notes?: string) => void;
  reset: () => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Strip the data:...;base64, prefix
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getWebSocketUrl(campaignId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/campaigns/${campaignId}/sessions/live`;
}

export function useLiveSession({
  campaignId,
}: UseLiveSessionOptions): UseLiveSessionReturn {
  const queryClient = useQueryClient();

  const [state, setState] = useState<LiveSessionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [markers, setMarkers] = useState<TranscriptMarker[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const titleRef = useRef<string>("");
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPingTimer = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const handleAudioChunk = useCallback(
    async (chunk: Blob) => {
      try {
        const base64 = await blobToBase64(chunk);
        sendMessage({ event: "audio", data: base64 });
      } catch {
        // Silently ignore encoding errors for individual chunks
      }
    },
    [sendMessage]
  );

  const recorder = useAudioRecorder({
    onDataAvailable: handleAudioChunk,
    chunkInterval: 5000,
  });

  const handleServerMessage = useCallback(
    (data: ServerMessage) => {
      switch (data.event) {
        case "ready":
          setSessionId(data.sessionId ?? null);
          break;

        case "transcript":
          if (data.fullText) setTranscript(data.fullText);
          if (data.segments) {
            setSegments((prev) => [...prev, ...data.segments!]);
          }
          break;

        case "marker_added":
          if (data.marker) {
            setMarkers((prev) => [...prev, data.marker!]);
          }
          break;

        case "stopped":
          setState("stopped");
          recorder.stop();
          // Invalidate session list so the new session appears
          queryClient.invalidateQueries({
            queryKey: sessionKeys.all(campaignId),
          });
          break;

        case "error":
          if (data.code === "INACTIVITY_WARNING") {
            // Don't treat inactivity warnings as fatal errors
            break;
          }
          setError(data.message ?? "An error occurred");
          if (data.code === "INACTIVITY_DISCONNECT") {
            setState("error");
            recorder.stop();
          }
          break;
      }
    },
    [campaignId, queryClient, recorder]
  );

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      clearPingTimer();
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [clearPingTimer]);

  const startRecording = useCallback(
    (title?: string) => {
      setError(null);
      setState("connecting");
      titleRef.current = title ?? "";

      const ws = new WebSocket(getWebSocketUrl(campaignId));
      socketRef.current = ws;

      ws.onopen = async () => {
        // Start the microphone recorder first
        await recorder.start();

        // Then tell the server to create the session
        sendMessage({
          event: "start",
          title: titleRef.current || undefined,
          saveAudio: true,
        });

        setState("recording");

        // Keepalive: ping every 30s so the server's inactivity timer doesn't
        // fire when the tab is backgrounded and MediaRecorder chunks throttle.
        clearPingTimer();
        pingTimerRef.current = setInterval(() => {
          sendMessage({ event: "ping" });
        }, 30_000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as ServerMessage;
          handleServerMessage(data);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        clearPingTimer();
        setError("WebSocket connection failed");
        setState("error");
        recorder.stop();
      };

      ws.onclose = (event) => {
        clearPingTimer();
        // Only set error if we weren't expecting the close
        if (state !== "stopping" && state !== "stopped" && state !== "idle") {
          if (event.code !== 1000) {
            setError(event.reason || "Connection closed unexpectedly");
            setState("error");
            recorder.stop();
          }
        }
      };
    },
    [campaignId, recorder, sendMessage, handleServerMessage, state, clearPingTimer]
  );

  const stopRecording = useCallback(async () => {
    setState("stopping");
    // Stop the transcription recorder (fires final chunk)
    recorder.stop();
    // Get the complete continuous recording and send it for S3 storage
    const fullBlob = await recorder.getFullRecording();
    if (fullBlob.size > 0) {
      try {
        const base64 = await blobToBase64(fullBlob);
        sendMessage({ event: "final_audio", data: base64 });
      } catch {
        // If encoding fails, proceed without full audio
      }
    }
    sendMessage({ event: "stop" });
  }, [recorder, sendMessage]);

  const pauseRecording = useCallback(() => {
    recorder.pause();
    setState("paused");
  }, [recorder]);

  const resumeRecording = useCallback(() => {
    recorder.resume();
    setState("recording");
  }, [recorder]);

  const addMarker = useCallback(
    (label: string, type?: string, notes?: string) => {
      sendMessage({
        event: "marker",
        label,
        ...(type ? { type } : {}),
        ...(notes ? { notes } : {}),
      });
    },
    [sendMessage]
  );

  const reset = useCallback(() => {
    clearPingTimer();
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    recorder.stop();
    setState("idle");
    setError(null);
    setSessionId(null);
    setTranscript("");
    setSegments([]);
    setMarkers([]);
  }, [recorder, clearPingTimer]);

  return {
    state,
    error,
    sessionId,
    transcript,
    segments,
    markers,
    elapsedTime: recorder.elapsedTime,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    addMarker,
    reset,
  };
}
