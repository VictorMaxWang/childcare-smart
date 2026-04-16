function uniqueNonEmptyLines(lines: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function looksLikeDebugLabel(line: string) {
  return /^(why it matters|tonight'?s top action|tonight actions|follow-up window|estimated time|recent context|debug|evaluator|source|model|revisions?|score|can_send)\b/i.test(
    line.trim()
  );
}

function looksLikeInternalLeak(line: string) {
  return /(admin-agent|recent context|memorymeta|evaluationmeta|debugiterations|can_send|raw json|backend fallback|fully live|providertrace|trace meta)/i.test(
    line
  );
}

function looksLikeJsonLine(line: string) {
  const normalized = line.trim();
  return (
    normalized.startsWith("{") ||
    normalized.startsWith("[") ||
    /^"[^"]+"\s*:\s*/.test(normalized)
  );
}

export function sanitizeParentFacingText(text: string | null | undefined) {
  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  const withoutCodeBlocks = normalized
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "");

  const cleanedLines = uniqueNonEmptyLines(
    withoutCodeBlocks
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) {
          return false;
        }

        if (looksLikeDebugLabel(line) || looksLikeInternalLeak(line) || looksLikeJsonLine(line)) {
          return false;
        }

        return true;
      })
  );

  return cleanedLines.join("\n\n").trim();
}

export function sanitizeParentFacingList(items: Array<string | null | undefined>, limit = items.length) {
  return uniqueNonEmptyLines(
    items
      .map((item) => sanitizeParentFacingText(item))
      .filter(Boolean)
  ).slice(0, limit);
}
