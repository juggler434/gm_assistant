// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo } from "react";
import type { AnswerSource } from "@/types";

interface CitedTextProps {
  text: string;
  sources: AnswerSource[];
}

/**
 * Renders text with inline [N] citation markers as superscript elements.
 * Hovering a citation shows a tooltip with the source document details.
 */
export function CitedText({ text, sources }: CitedTextProps) {
  const sourceMap = useMemo(() => {
    const map = new Map<number, AnswerSource>();
    for (const source of sources) {
      const idx = source.index ?? sources.indexOf(source) + 1;
      map.set(idx, source);
    }
    return map;
  }, [sources]);

  const parts = useMemo(() => {
    const result: Array<{ type: "text"; value: string } | { type: "cite"; index: number }> = [];
    const regex = /\[(\d+)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const citationIndex = parseInt(match[1], 10);

      // Only treat as citation if we have a matching source
      if (!sourceMap.has(citationIndex)) continue;

      if (match.index > lastIndex) {
        result.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }
      result.push({ type: "cite", index: citationIndex });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      result.push({ type: "text", value: text.slice(lastIndex) });
    }

    return result;
  }, [text, sourceMap]);

  // No citations found — render plain text
  if (parts.length === 1 && parts[0].type === "text") {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <span key={i}>{part.value}</span>;
        }
        const source = sourceMap.get(part.index);
        if (!source) return null;

        const titleParts = [source.documentName];
        if (source.section) titleParts.push(source.section);
        if (source.pageNumber !== null) titleParts.push(`p. ${source.pageNumber}`);

        return (
          <sup
            key={i}
            className="cursor-help text-[0.7em] text-primary"
            title={titleParts.join(" - ")}
          >
            [{part.index}]
          </sup>
        );
      })}
    </>
  );
}
