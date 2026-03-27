import assert from "node:assert/strict";
import test from "node:test";

import { buildRssXml } from "../../src/modules/domain/rssSerializer";
import type { FeedEntry } from "../../src/modules/domain/types";

const items: FeedEntry[] = [
  {
    title:
      "[Journal of the American Chemical Society: Latest Articles (ACS Publications)] [ASAP] Fast ionic conduction",
    link: "https://example.com/older",
    summary: "Older article",
    journal:
      "Journal of the American Chemical Society: Latest Articles (ACS Publications)",
    id: "older-guid",
    pubDate: new Date("2026-01-01T00:00:00Z"),
  },
  {
    title: "Recent article with bad control \u0007 char",
    link: "https://example.com/newer",
    summary: "Summary with bad control \u0007 char",
    journal: "Nature Communications",
    id: "newer-guid",
    pubDate: new Date("2026-02-01T00:00:00Z"),
  },
];

test("buildRssXml sorts items by publication date descending", () => {
  const xml = buildRssXml(items, { maxItems: 10 });
  const newerIndex = xml.indexOf("newer-guid");
  const olderIndex = xml.indexOf("older-guid");

  assert.notEqual(newerIndex, -1);
  assert.notEqual(olderIndex, -1);
  assert.ok(newerIndex < olderIndex);
});

test("buildRssXml cleans titles, maps journal abbreviations, and removes illegal XML chars", () => {
  const xml = buildRssXml(items, { maxItems: 10 });

  assert.match(xml, /<title>Fast ionic conduction<\/title>/);
  assert.match(xml, /<dc:source>JACS<\/dc:source>/);
  assert.match(xml, /<dc:source>Nat\. Commun\.<\/dc:source>/);
  assert.doesNotMatch(xml, /\u0007/);
});

test("buildRssXml tolerates invalid publication dates instead of throwing", () => {
  const xml = buildRssXml([
    {
      title: "Entry with invalid date",
      link: "https://example.com/invalid-date",
      summary: "Should still serialize.",
      journal: "Nature Communications",
      id: "invalid-date-guid",
      pubDate: new Date("not-a-real-date"),
    },
  ]);

  assert.match(xml, /invalid-date-guid/);
  assert.match(xml, /<pubDate>.*<\/pubDate>/);
});
