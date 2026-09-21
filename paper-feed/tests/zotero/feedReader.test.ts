import assert from "node:assert/strict";
import test from "node:test";

import { describeFeedReaderFailure } from "../../src/modules/zotero/compat/feedReader";
import { readFeedSourceWithZotero } from "../../src/modules/zotero/compat/feedReader";
import { DOMParser } from "@xmldom/xmldom";
import { parseAcsFeed } from "../../src/modules/zotero/compat/acsFeed";
import { enrichFromCrossref } from "../../src/modules/zotero/compat/crossrefMetadata";
import {
  extractDoi,
  normalizeFeedSourceItem,
  normalizeFeedSourceUrl,
} from "../../src/modules/fetch/feedSource";

const acsXml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:prism="http://purl.org/rss/1.0/modules/prism/">
<channel><title>ACS Energy Letters advanceAccess</title>
<managingEditor>editor@pubs.acs.org/aelccp</managingEditor>
<item><title>Pressure-Driven Performance</title>
<link>https://pubs.acs.org/aelccp/article/doi/10.1021/acsenergylett.6c02060/5432975/Pressure-Driven-Performance</link>
<guid>paper-1</guid><pubDate>Fri, 18 Sep 2026 00:00:00 GMT</pubDate>
<description>&lt;p&gt;Solid-state batteries&lt;/p&gt;</description>
<prism:doi xmlns:prism="prism">10.1021/acsenergylett.6c02060</prism:doi>
<prism:volume xmlns:prism="prism">11</prism:volume>
<prism:number xmlns:prism="prism">9</prism:number>
<prism:startingPage xmlns:prism="prism">100</prism:startingPage>
<prism:endingPage xmlns:prism="prism">110</prism:endingPage>
</item></channel></rss>`;

test("ACS legacy URLs migrate to official ASAP/current issue feeds only", () => {
  assert.equal(
    normalizeFeedSourceUrl(
      "pubs.acs.org/action/showFeed?type=axatoc&feed=rss&jc=jacsat",
    ),
    "https://pubs.acs.org/rss/jacsat/asap.xml",
  );
  assert.equal(
    normalizeFeedSourceUrl(
      "http://pubs.acs.org/action/showFeed?jc=ancac3&type=etoc&feed=rss",
    ),
    "https://pubs.acs.org/rss/ancac3/currentIssue.xml",
  );
  for (const url of [
    "https://example.com/action/showFeed?type=axatoc&jc=jacsat",
    "https://pubs.acs.org/action/showFeed?type=unknown&jc=jacsat",
    "https://pubs.acs.org/rss/jacsat/asap.xml",
  ]) {
    assert.equal(normalizeFeedSourceUrl(url), url);
  }
});

test("ACS XML preserves malformed PRISM metadata without treating the editor as author", async () => {
  const originalZotero = globalThis.Zotero;
  (globalThis as any).Zotero = {
    HTTP: {
      async request(method: string, url: string) {
        assert.equal(method, "GET");
        assert.equal(url, "https://pubs.acs.org/rss/aelccp/asap.xml");
        return {
          responseXML: new DOMParser().parseFromString(acsXml, "text/xml"),
        };
      },
    },
  };
  try {
    const source = await readFeedSourceWithZotero(
      "https://pubs.acs.org/action/showFeed?type=axatoc&jc=aelccp",
    );
    const entry = normalizeFeedSourceItem(source.items[0], {
      fallbackJournal: source.feedTitle,
      fallbackLink: source.sourceUrl,
    })!;
    assert.equal(source.feedTitle, "ACS Energy Letters");
    assert.equal(entry.doi, "10.1021/acsenergylett.6c02060");
    assert.equal(entry.authors, null);
    assert.equal(entry.summary, "<p>Solid-state batteries</p>");
    assert.equal(entry.volume, "11");
    assert.equal(entry.issue, "9");
    assert.equal(entry.pages, "100–110");
    assert.equal(entry.pubDate.toISOString(), "2026-09-18T00:00:00.000Z");
  } finally {
    (globalThis as any).Zotero = originalZotero;
  }
});

test("ACS rejects challenge HTML and missing XML", () => {
  assert.throws(
    () =>
      parseAcsFeed(
        new DOMParser().parseFromString(
          "<html><title>Challenge</title></html>",
          "text/xml",
        ) as unknown as Document,
        "https://pubs.acs.org/rss/jacsat/asap.xml",
      ),
    /Expected ACS RSS/,
  );
  assert.throws(
    () => parseAcsFeed(null, "https://pubs.acs.org/rss/jacsat/asap.xml"),
    /no XML/,
  );
});

test("DOI extraction handles resolver, old and new ACS links without article ID suffixes", () => {
  assert.equal(
    extractDoi("https://doi.org/10.1000%2Ftest?via=rss"),
    "10.1000/test",
  );
  assert.equal(
    extractDoi("https://pubs.acs.org/doi/abs/10.1021/test.123"),
    "10.1021/test.123",
  );
  assert.equal(
    extractDoi(
      "https://pubs.acs.org/jacsat/article/doi/10.1021/jacs.123/12345/Title",
    ),
    "10.1021/jacs.123",
  );
  assert.equal(extractDoi("https://example.com/no-doi"), null);
});

test("Crossref supplements exact DOI matches, preserves existing fields, and tolerates 404", async () => {
  const originalZotero = globalThis.Zotero;
  const entry = normalizeFeedSourceItem(
    {
      DOI: "10.1021/test",
      title: "Test",
      url: "https://example.com/test",
      volume: "11",
    },
    { fallbackJournal: "ACS", fallbackLink: "https://example.com" },
  )!;
  let status = 200;
  let doi = "10.1021/test";
  (globalThis as any).Zotero = {
    HTTP: {
      async request(_method: string, url: string) {
        assert.equal(url, "https://api.crossref.org/works/10.1021%2Ftest");
        return {
          status,
          response: {
            message: {
              DOI: doi,
              author: [
                { given: "Arpan K.", family: "Sharma" },
                { name: "Research Consortium" },
              ],
              "container-title": ["ACS Energy Letters"],
              volume: "99",
              issue: "9",
              page: "100-110",
              ISSN: ["2380-8195"],
            },
          },
        };
      },
    },
  };
  try {
    const enriched = await enrichFromCrossref(entry);
    assert.deepEqual(enriched.authorNames, [
      "Arpan K. Sharma",
      "Research Consortium",
    ]);
    assert.equal(enriched.authors, "Arpan K. Sharma, Research Consortium");
    assert.equal(enriched.volume, "11");
    assert.equal(enriched.issue, "9");
    assert.equal(entry.authors, null);
    doi = "10.1021/other";
    await assert.rejects(enrichFromCrossref(entry), /different or missing DOI/);
    status = 404;
    assert.equal(await enrichFromCrossref(entry), entry);
  } finally {
    (globalThis as any).Zotero = originalZotero;
  }
});

test("describeFeedReaderFailure reports Cloudflare challenges clearly", async () => {
  const originalZotero = globalThis.Zotero;

  (globalThis as any).Zotero = {
    HTTP: {
      async request() {
        return {
          status: 403,
          responseText: "<html><title>Just a moment...</title></html>",
          getResponseHeader(name: string) {
            return name.toLowerCase() === "cf-mitigated"
              ? "challenge"
              : "text/html";
          },
        };
      },
    },
  };

  try {
    const message = await describeFeedReaderFailure(
      "https://chemrxiv.org/engage/rss/chemrxiv",
      new Error("Processing failed"),
    );
    assert.equal(message, "HTTP 403 blocked by Cloudflare challenge");
  } finally {
    (globalThis as any).Zotero = originalZotero;
  }
});

test("describeFeedReaderFailure falls back to the original error when diagnostics are unavailable", async () => {
  const originalZotero = globalThis.Zotero;
  (globalThis as any).Zotero = {};

  try {
    const message = await describeFeedReaderFailure(
      "https://example.com/feed.xml",
      new Error("Processing failed"),
    );
    assert.equal(message, "Processing failed");
  } finally {
    (globalThis as any).Zotero = originalZotero;
  }
});
