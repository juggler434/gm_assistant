// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Strips `<source>` / `</source>` tags from attacker-controlled text before it
 * is interpolated into an LLM prompt. The RAG prompt relies on `<source>` as
 * its untrusted-data boundary; letting a retrieved chunk, a document name, or
 * a conversation turn emit its own `</source>` would let that text escape the
 * boundary and have its trailing content treated as instructions.
 */
export function stripSourceSentinels(text: string): string {
  return text.replace(/<\/?source\b[^>]*>/gi, "");
}
