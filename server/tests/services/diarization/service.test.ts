// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

// -- Hoisted mocks -------------------------------------------------------
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

// -- Import SUT after mocks ----------------------------------------------
import {
  diarizeAudio,
  mapSpeakersToSegments,
  type DiarizationConfig,
  type DiarizationSpeakerSegment,
} from "../../../src/services/diarization/service.js";

const defaultConfig: DiarizationConfig = {
  baseUrl: "http://localhost:8002",
  timeout: 120000,
};

describe("Diarization Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("diarizeAudio", () => {
    it("sends audio and returns speaker segments on success", async () => {
      const speakers = [
        { speaker: "SPEAKER_00", start: 0.0, end: 3.5 },
        { speaker: "SPEAKER_01", start: 3.5, end: 7.2 },
        { speaker: "SPEAKER_00", start: 7.2, end: 10.0 },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ speakers }),
      });

      const result = await diarizeAudio(Buffer.from("audio"), defaultConfig);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.speakers).toEqual(speakers);
        expect(result.value.speakers).toHaveLength(3);
      }

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("http://localhost:8002/diarize");
      expect(options.method).toBe("POST");
      expect(options.body).toBeInstanceOf(FormData);
    });

    it("returns NETWORK_ERROR on connection failure", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await diarizeAudio(Buffer.from("audio"), defaultConfig);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NETWORK_ERROR");
        expect(result.error.message).toContain("ECONNREFUSED");
      }
    });

    it("returns TIMEOUT on abort", async () => {
      mockFetch.mockRejectedValue(
        new DOMException("Aborted", "AbortError"),
      );

      const result = await diarizeAudio(Buffer.from("audio"), defaultConfig);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TIMEOUT");
      }
    });

    it("returns API_ERROR on non-ok response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve("Diarization failed: bad audio"),
      });

      const result = await diarizeAudio(Buffer.from("audio"), defaultConfig);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("API_ERROR");
        expect(result.error.statusCode).toBe(422);
      }
    });

    it("returns INVALID_RESPONSE on invalid JSON", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("not json")),
      });

      const result = await diarizeAudio(Buffer.from("audio"), defaultConfig);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_RESPONSE");
      }
    });

    it("handles missing speakers array gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await diarizeAudio(Buffer.from("audio"), defaultConfig);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.speakers).toEqual([]);
      }
    });
  });

  describe("mapSpeakersToSegments", () => {
    const diarizationSpeakers: DiarizationSpeakerSegment[] = [
      { speaker: "SPEAKER_00", start: 0.0, end: 5.0 },
      { speaker: "SPEAKER_01", start: 5.0, end: 10.0 },
      { speaker: "SPEAKER_00", start: 10.0, end: 15.0 },
    ];

    it("maps speakers to segments based on time overlap", () => {
      const segments = [
        { startTime: 0.0, endTime: 4.0, speaker: "unknown", text: "Hello" },
        { startTime: 5.5, endTime: 9.0, speaker: "unknown", text: "Hi there" },
        { startTime: 10.0, endTime: 14.0, speaker: "unknown", text: "Goodbye" },
      ];

      const result = mapSpeakersToSegments(segments, diarizationSpeakers);

      expect(result[0]!.speaker).toBe("Speaker 1");
      expect(result[1]!.speaker).toBe("Speaker 2");
      expect(result[2]!.speaker).toBe("Speaker 1");
    });

    it("uses consistent labels (same voice = same label)", () => {
      const segments = [
        { startTime: 0.0, endTime: 3.0, speaker: "unknown", text: "A" },
        { startTime: 11.0, endTime: 14.0, speaker: "unknown", text: "B" },
      ];

      const result = mapSpeakersToSegments(segments, diarizationSpeakers);

      // Both segments overlap with SPEAKER_00 → should get same label
      expect(result[0]!.speaker).toBe("Speaker 1");
      expect(result[1]!.speaker).toBe("Speaker 1");
    });

    it("returns segments unchanged when diarization has no speakers", () => {
      const segments = [
        { startTime: 0.0, endTime: 4.0, speaker: "unknown", text: "Hello" },
      ];

      const result = mapSpeakersToSegments(segments, []);

      expect(result[0]!.speaker).toBe("unknown");
    });

    it("keeps original speaker when no overlap is found", () => {
      const segments = [
        { startTime: 100.0, endTime: 110.0, speaker: "unknown", text: "Way later" },
      ];

      const result = mapSpeakersToSegments(segments, diarizationSpeakers);

      expect(result[0]!.speaker).toBe("unknown");
    });

    it("assigns speaker with greatest overlap when segment spans multiple speakers", () => {
      const segments = [
        // Overlaps SPEAKER_00 for 2s (3-5) and SPEAKER_01 for 3s (5-8)
        { startTime: 3.0, endTime: 8.0, speaker: "unknown", text: "Cross-boundary" },
      ];

      const result = mapSpeakersToSegments(segments, diarizationSpeakers);

      expect(result[0]!.speaker).toBe("Speaker 2"); // SPEAKER_01 has more overlap
    });

    it("does not mutate the original segments array", () => {
      const segments = [
        { startTime: 0.0, endTime: 4.0, speaker: "unknown", text: "Hello" },
      ];

      const result = mapSpeakersToSegments(segments, diarizationSpeakers);

      expect(segments[0]!.speaker).toBe("unknown");
      expect(result[0]!.speaker).toBe("Speaker 1");
    });
  });
});
