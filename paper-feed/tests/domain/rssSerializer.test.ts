import assert from "node:assert/strict";
import test from "node:test";

import { buildRssXml } from "../../src/modules/domain/rssSerializer";
import type { FeedEntry } from "../../src/modules/domain/types";
import { DOMParser } from "@xmldom/xmldom";
import {
  parseStoredFeedSnapshot,
  serializeFeedSnapshot,
} from "../../src/modules/storage/feedSnapshotStore";

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

test("metadata survives snapshot and XML serialization with separate author elements", () => {
  const entry = {
    ...items[0],
    doi: "10.1021/test",
    authors: "Alice & Bob, Li, Ming",
    authorNames: ["Alice & Bob", "Li, Ming"],
    volume: "10",
    issue: "2",
    pages: "1–9",
    ISSN: "1234-5678",
  };
  const snapshot = parseStoredFeedSnapshot(
    serializeFeedSnapshot({ generatedAt: null, items: [entry] }),
  );
  const xml = buildRssXml(snapshot.items);
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const dc = "http://purl.org/dc/elements/1.1/";
  assert.deepEqual(
    Array.from(doc.getElementsByTagNameNS(dc, "creator")).map(
      (node) => node.textContent,
    ),
    ["Alice & Bob", "Li, Ming"],
  );
  assert.equal(
    doc.getElementsByTagNameNS(dc, "identifier")[0].textContent,
    "doi:10.1021/test",
  );
  assert.match(xml, /<prism:volume>10<\/prism:volume>/);
  assert.match(xml, /<prism:pageRange>1–9<\/prism:pageRange>/);
});

test("legacy cached author strings remain available without speculative name splitting", () => {
  const xml = buildRssXml([
    { ...items[0], authors: "Smith, Jane", doi: "10.1000/test" },
  ]);
  assert.match(xml, /<dc:creator>Smith, Jane<\/dc:creator>/);
  assert.doesNotMatch(buildRssXml(items), /<dc:creator>|<dc:identifier>/);
});

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
