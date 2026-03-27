import { JOURNAL_MAP } from "./journalMapData";

const exactLookup = new Map(
  JOURNAL_MAP.map((entry) => [entry.prefix.trim(), entry.abbr]),
);

const containsLookup = JOURNAL_MAP.map((entry) => ({
  prefixLower: entry.prefix.trim().toLowerCase(),
  abbr: entry.abbr,
}));

export function getJournalAbbr(journalRaw: string) {
  const stripped = journalRaw.trim();

  if (exactLookup.has(stripped)) {
    return exactLookup.get(stripped)!;
  }

  const lower = stripped.toLowerCase();
  for (const entry of containsLookup) {
    if (lower.includes(entry.prefixLower)) {
      return entry.abbr;
    }
  }

  return journalRaw;
}

export function cleanTitle(title: string, journalRaw: string) {
  const escaped = journalRaw
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\[${escaped}\\]\\s*(?:\\[[^\\]]*\\]\\s*)*`, "i");
  const cleaned = title.replace(pattern, "").trim();
  return cleaned || title;
}
