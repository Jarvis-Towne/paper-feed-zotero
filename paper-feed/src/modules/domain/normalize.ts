export function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

export function removeIllegalXmlChars(text: string) {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

export function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function ensureDate(value: Date | string | number | null | undefined) {
  const fallbackDate = new Date();

  if (value == null) {
    return fallbackDate;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallbackDate : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallbackDate : parsed;
}
