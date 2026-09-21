// Optional network check: node --import tsx tests/zotero/acsFeed.live.ts
// Uses Node HTTP + an XML DOM adapter, not a running Zotero application.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";
import {
  normalizeFeedSourceItem,
  normalizeFeedSourceUrl,
} from "../../src/modules/fetch/feedSource";
import { readFeedSourceWithZotero } from "../../src/modules/zotero/compat/feedReader";
import { enrichFromCrossref } from "../../src/modules/zotero/compat/crossrefMetadata";
import { buildRssXml } from "../../src/modules/domain/rssSerializer";

(globalThis as any).Zotero = {
  HTTP: {
    async request(
      _method: string,
      url: string,
      options: {
        responseType: string;
        timeout: number;
        headers: Record<string, string>;
        successCodes?: number[];
      },
    ) {
      const response = await fetch(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(options.timeout),
      });
      assert.ok(
        response.ok || options.successCodes?.includes(response.status),
        `HTTP ${response.status}: ${url}`,
      );
      const text = await response.text();
      return {
        status: response.status,
        response: options.responseType === "json" ? JSON.parse(text) : null,
        responseXML:
          options.responseType === "document"
            ? new DOMParser().parseFromString(text, "text/xml")
            : null,
      };
    },
  },
};

const sourceList = await readFile(
  new URL("../../../RSS/ComputationalMaterials.txt", import.meta.url),
  "utf8",
);
const urls = [
  ...new Set(
    sourceList.match(/https:\/\/pubs\.acs\.org\/action\/showFeed[^\s]+/g),
  ),
];
urls.push("https://pubs.acs.org/action/showFeed?type=etoc&feed=rss&jc=jacsat");
for (const url of urls) {
  const source = await readFeedSourceWithZotero(url);
  assert.ok(source.items.length > 0, `Empty feed: ${url}`);
  const entries = source.items.map(
    (item) =>
      normalizeFeedSourceItem(item, {
        fallbackJournal: source.feedTitle,
        fallbackLink: source.sourceUrl,
      })!,
  );
  assert.ok(
    entries.every((entry) => entry.doi),
    `Missing DOI: ${url}`,
  );
  const result: Record<string, unknown> = {
    url: normalizeFeedSourceUrl(url),
    items: entries.length,
    doiCount: entries.filter((entry) => entry.doi).length,
  };
  if (/jc=(aelccp|jacsat)$/.test(url) && url.includes("axatoc")) {
    const entry = await enrichFromCrossref(entries[0]);
    assert.ok(
      entry.authorNames?.length,
      `Missing Crossref authors: ${entry.doi}`,
    );
    const doc = new DOMParser().parseFromString(
      buildRssXml([entry]),
      "text/xml",
    );
    assert.equal(
      doc.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "creator")
        .length,
      entry.authorNames.length,
    );
    assert.equal(
      doc.getElementsByTagNameNS(
        "http://purl.org/dc/elements/1.1/",
        "identifier",
      )[0].textContent,
      `doi:${entry.doi}`,
    );
    result.sampleDoi = entry.doi;
    result.sampleAuthors = entry.authorNames.length;
  }
  console.log(JSON.stringify(result));
}
