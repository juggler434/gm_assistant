// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useRef, useCallback, useEffect } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "paused" | "error";

interface UseAudioRecorderOptions {
  onDataAvailable: (chunk: Blob) => void;
  /** Interval in ms between recorder restarts. Each restart produces a
   *  complete, independently decodable audio file. Default: 5000 */
  chunkInterval?: number;
}

interface UseAudioRecorderReturn {
  state: RecorderState;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  elapsedTime: number;
  /** Stop the continuous storage recorder and return the complete recording. */
  getFullRecording: () => Promise<Blob>;
}

function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function useAudioRecorder({
  onDataAvailable,
  chunkInterval = 5000,
}: UseAudioRecorderOptions): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Transcription recorder — restarts periodically for complete chunks
  const recorderRef = useRef<MediaRecorder | null>(null);
  // Storage recorder — runs continuously for the full recording
  const storageRecorderRef = useRef<MediaRecorder | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const mimeTypeRef = useRef("");
  const onDataRef = useRef(onDataAvailable);
  onDataRef.current = onDataAvailable;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearChunkTimer = useCallback(() => {
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }, []);

  const createTranscriptionRecorder = useCallback((stream: MediaStream): MediaRecorder => {
    const recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        onDataRef.current(e.data);
      }
    };
    return recorder;
  }, []);

  const cleanup = useCallback(() => {
    clearTimer();
    clearChunkTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    if (storageRecorderRef.current && storageRecorderRef.current.state !== "inactive") {
      storageRecorderRef.current.stop();
    }
    storageRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [clearTimer, clearChunkTimer]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const startElapsedTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => {
      setElapsedTime(
        Math.floor((Date.now() - startTimeRef.current) / 1000)
      );
    }, 1000);
  }, [clearTimer]);

  const startChunkCycle = useCallback(() => {
    clearChunkTimer();
    chunkTimerRef.current = setInterval(() => {
      const recorder = recorderRef.current;
      const stream = streamRef.current;
      if (recorder?.state === "recording" && stream) {
        recorder.stop();
        const next = createTranscriptionRecorder(stream);
        recorderRef.current = next;
        next.start();
      }
    }, chunkInterval);
  }, [clearChunkTimer, chunkInterval, createTranscriptionRecorder]);

  const start = useCallback(async () => {
    setError(null);
    setState("requesting");

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      setError("Your browser does not support audio recording.");
      setState("error");
      return;
    }
    mimeTypeRef.current = mimeType;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Transcription recorder — restarts every chunkInterval
      const recorder = createTranscriptionRecorder(stream);
      recorderRef.current = recorder;
      recorder.start();

      // Storage recorder — runs continuously for the full recording
      const storageRecorder = new MediaRecorder(stream, { mimeType });
      storageRecorderRef.current = storageRecorder;
      storageRecorder.start();

      startTimeRef.current = Date.now();
      pausedAtRef.current = 0;
      setElapsedTime(0);
      setState("recording");
      startElapsedTimer();
      startChunkCycle();
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was denied. Please allow microphone access in your browser settings."
          : "Failed to access microphone.";
      setError(msg);
      setState("error");
      cleanup();
    }
  }, [cleanup, startElapsedTimer, startChunkCycle, createTranscriptionRecorder]);

  const stop = useCallback(() => {
    clearChunkTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    // Storage recorder is stopped separately via getFullRecording()
    clearTimer();
    setState("idle");
  }, [clearTimer, clearChunkTimer]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
      clearChunkTimer();
      // Pause the storage recorder (keeps it running, just pauses encoding)
      if (storageRecorderRef.current?.state === "recording") {
        storageRecorderRef.current.pause();
      }
      pausedAtRef.current = Date.now();
      clearTimer();
      setState("paused");
    }
  }, [clearTimer, clearChunkTimer]);

  const resume = useCallback(() => {
    const stream = streamRef.current;
    if (stream && state === "paused") {
      const pauseDuration = Date.now() - pausedAtRef.current;
      startTimeRef.current += pauseDuration;

      // Resume storage recorder
      if (storageRecorderRef.current?.state === "paused") {
        storageRecorderRef.current.resume();
      }

      // Create fresh transcription recorder
      const recorder = createTranscriptionRecorder(stream);
      recorderRef.current = recorder;
      recorder.start();

      setState("recording");
      startElapsedTimer();
      startChunkCycle();
    }
  }, [state, createTranscriptionRecorder, startElapsedTimer, startChunkCycle]);

  const getFullRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = storageRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        // Release the stream if nothing else needs it
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        resolve(new Blob([], { type: mimeTypeRef.current }));
        return;
      }
      recorder.ondataavailable = (e) => {
        storageRecorderRef.current = null;
        // Release the stream now that both recorders are done
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        resolve(e.data);
      };
      recorder.stop();
    });
  }, []);

  return { state, error, start, stop, pause, resume, elapsedTime, getFullRecording };
}
