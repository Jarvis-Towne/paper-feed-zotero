import { escapeXml, removeIllegalXmlChars } from "../domain/normalize";
import type { AiSummaryConfig, FeedEntry } from "../domain/types";
import { getAiSummaryHtmlPath } from "./aiSummaryLinks";
import type { ChatCompletionClient } from "./llmClient";

interface PaperInsight {
  id: number;
  matched_direction: string;
  summary: string;
  importance?: string;
}

export interface AiSummaryReportResult {
  generatedAt: string;
  entry: FeedEntry;
  matchedCount: number;
}

const BATCH_INSIGHT_SYSTEM_PROMPT = [
  "You are a world-class scientific literature screening and summarization assistant.",
  "For each batch, select only papers strictly related to the user's research interests.",
  "For selected papers, classify them by matched research direction and write a dense 2-3 sentence Chinese summary.",
  "Return only a valid JSON array. Do not include markdown fences or conversational text.",
].join(" ");

const FINAL_HTML_SYSTEM_PROMPT = [
  "You are an expert scientific editor and HTML formatter.",
  "Create a clean, modern HTML literature digest from classified paper summaries.",
  "Group papers by the user's research directions in importance order.",
  "Return only the HTML snippet inside body tags. Do not include markdown fences.",
].join(" ");

const SCREENING_BATCH_SIZE = 25;
const MAX_SELECTED_PAPERS = 40;

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatLocalDateLabel(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

function formatLocalTimestampSlug(date: Date) {
  return [
    formatLocalDateLabel(date),
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join("-");
}

function stripCodeFence(value: string) {
  return value
    .replace(/^```(?:html|json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBodyHtml(value: string) {
  const stripped = stripCodeFence(value);
  const bodyMatch = stripped.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (bodyMatch?.[1] ?? stripped).trim();
}

function parseJsonArray(value: string): unknown[] {
  const stripped = stripCodeFence(value);
  const jsonMatch = stripped.match(/\[[\s\S]*\]/);
  const parsed = JSON.parse(jsonMatch?.[0] ?? stripped) as unknown;

  return Array.isArray(parsed) ? parsed : [];
}

function parsePaperInsights(value: string): PaperInsight[] {
  const insights: Array<PaperInsight | null> = parseJsonArray(value).map(
    (item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Partial<PaperInsight>;
      const id = Number(raw.id);
      const matchedDirection =
        typeof raw.matched_direction === "string"
          ? raw.matched_direction.trim()
          : "";
      const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";

      if (!Number.isInteger(id) || !matchedDirection || !summary) {
        return null;
      }

      return {
        id,
        matched_direction: matchedDirection,
        summary,
        importance:
          typeof raw.importance === "string" ? raw.importance.trim() : "",
      };
    },
  );

  return insights.filter((item): item is PaperInsight => !!item);
}

function paperForPrompt(entry: FeedEntry, index: number) {
  return {
    id: index + 1,
    title: entry.title,
    abstract: entry.summary,
    authors: entry.authors || "",
    journal: entry.journal,
    doi: entry.doi || "",
    url: entry.link,
    pubDate: entry.pubDate.toISOString(),
  };
}

function chunkPapers(papers: FeedEntry[]) {
  const chunks: Array<{ offset: number; papers: FeedEntry[] }> = [];

  for (let offset = 0; offset < papers.length; offset += SCREENING_BATCH_SIZE) {
    chunks.push({
      offset,
      papers: papers.slice(offset, offset + SCREENING_BATCH_SIZE),
    });
  }

  return chunks;
}

function createBatchInsightPrompt(
  config: AiSummaryConfig,
  papers: FeedEntry[],
  offset = 0,
) {
  return [
    "User Interests & Importance Order:",
    config.prompt,
    "",
    "Paper Batch:",
    JSON.stringify(
      papers.map((paper, index) => paperForPrompt(paper, offset + index)),
      null,
      2,
    ),
    "",
    "Instructions:",
    "1. Compare each paper against the user's interests and importance order.",
    "2. Discard unrelated papers completely; do not mention them.",
    "3. For every related paper, classify it by the most relevant user-defined direction.",
    "4. Write a 2-3 sentence Chinese summary focusing on problem, method/tool, and key finding.",
    "5. Return only a JSON array in this format:",
    '[{"id":1,"matched_direction":"用户方向关键词","importance":"high|medium|low","summary":"中文总结"}]',
  ].join("\n");
}

function createFinalHtmlPrompt(input: {
  config: AiSummaryConfig;
  papers: FeedEntry[];
  insights: PaperInsight[];
  totalCount: number;
  generatedAt: string;
}) {
  const paperMap = new Map(
    input.papers.map((paper, index) => [
      index + 1,
      paperForPrompt(paper, index),
    ]),
  );
  const selected = input.insights
    .map((insight) => ({
      ...paperMap.get(insight.id),
      matched_direction: insight.matched_direction,
      importance: insight.importance || "",
      summary: insight.summary,
    }))
    .filter((paper) => paper.title);

  return [
    "User Interests & Importance Order:",
    input.config.prompt,
    "",
    `Generated At: ${input.generatedAt}`,
    `Today's Candidate Paper Count: ${input.totalCount}`,
    `Selected Paper Count: ${selected.length}`,
    "",
    "Classified Paper Summaries:",
    JSON.stringify(selected, null, 2),
    "",
    "HTML Requirements:",
    "1. Generate one complete HTML snippet suitable for an RSS item description.",
    "2. Use inline styles only.",
    "3. Include the title Daily AI Literature Insights, generation time, candidate count, and selected count.",
    "4. Group papers by the user's research directions, ordered by the user's importance order.",
    "5. For each paper, include linked title, authors, journal, DOI if available, matched direction, and the provided Chinese summary.",
    "6. Highlight key materials, chemical formulas, tools, or algorithms with <strong> tags when appropriate.",
    "7. Return only HTML content; no markdown fences.",
  ].join("\n");
}

function createEmptyReportHtml(input: {
  generatedAt: string;
  totalCount: number;
}) {
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6;color:#2d3748;">',
    '<div style="border-bottom:2px solid #4A90E2;padding-bottom:10px;margin-bottom:20px;">',
    '<h2 style="margin:0;color:#1A365D;font-size:22px;">Daily AI Literature Insights</h2>',
    `<p style="margin:6px 0 0;color:#718096;font-size:13px;">生成时间: ${escapeXml(input.generatedAt)} | 今日候选文献: ${input.totalCount} 篇 | AI 选中: 0 篇</p>`,
    "</div>",
    '<div style="text-align:center;color:#718096;padding:36px 0;border:1px solid #E2E8F0;border-radius:8px;background:#F7FAFC;">今日暂无与您订阅方向高度相关的文献更新。</div>',
    "</div>",
  ].join("");
}

function wrapAiHtml(input: {
  html: string;
  generatedAt: string;
  totalCount: number;
  matchedCount: number;
}) {
  const html = extractBodyHtml(input.html);
  if (/Daily AI Literature Insights/i.test(html)) {
    return html;
  }

  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6;color:#2d3748;">',
    '<div style="border-bottom:2px solid #4A90E2;padding-bottom:10px;margin-bottom:20px;">',
    '<h2 style="margin:0;color:#1A365D;font-size:22px;">Daily AI Literature Insights</h2>',
    `<p style="margin:6px 0 0;color:#718096;font-size:13px;">生成时间: ${escapeXml(input.generatedAt)} | 今日候选文献: ${input.totalCount} 篇 | AI 选中: ${input.matchedCount} 篇</p>`,
    "</div>",
    html,
    "</div>",
  ].join("");
}

function createReportEntry(input: {
  generatedAt: string;
  html: string;
  matchedCount: number;
  totalCount: number;
}): FeedEntry {
  const date = new Date(input.generatedAt);
  const dateLabel = formatLocalDateLabel(date);
  const timestampSlug = formatLocalTimestampSlug(date);

  return {
    title: `AI Literature Summary - ${dateLabel} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`,
    link: `http://127.0.0.1${getAiSummaryHtmlPath(timestampSlug)}`,
    summary: removeIllegalXmlChars(input.html),
    journal: "Paper Feed AI",
    id: `paper-feed-ai-summary-${timestampSlug}`,
    pubDate: date,
    authors: "Paper Feed AI",
    doi: null,
  };
}

export function isAiSummaryConfigUsable(config: AiSummaryConfig) {
  return (
    config.enabled &&
    !!config.baseUrl.trim() &&
    !!config.apiKey.trim() &&
    !!config.model.trim() &&
    !!config.prompt.trim()
  );
}

export async function generateAiSummaryReport(input: {
  config: AiSummaryConfig;
  papers: FeedEntry[];
  client: ChatCompletionClient;
  now?: Date;
}): Promise<AiSummaryReportResult> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const allInsights: PaperInsight[] = [];

  for (const batch of chunkPapers(input.papers)) {
    const batchResult = await input.client.complete([
      { role: "system", content: BATCH_INSIGHT_SYSTEM_PROMPT },
      {
        role: "user",
        content: createBatchInsightPrompt(
          input.config,
          batch.papers,
          batch.offset,
        ),
      },
    ]);
    allInsights.push(...parsePaperInsights(batchResult));
  }

  const seenInsightIds = new Set<number>();
  const insights = allInsights
    .filter((insight) => insight.id >= 1 && insight.id <= input.papers.length)
    .filter((insight) => {
      if (seenInsightIds.has(insight.id)) {
        return false;
      }
      seenInsightIds.add(insight.id);
      return true;
    })
    .slice(0, MAX_SELECTED_PAPERS);

  const html = insights.length
    ? wrapAiHtml({
        html: await input.client.complete([
          { role: "system", content: FINAL_HTML_SYSTEM_PROMPT },
          {
            role: "user",
            content: createFinalHtmlPrompt({
              config: input.config,
              papers: input.papers,
              insights,
              totalCount: input.papers.length,
              generatedAt,
            }),
          },
        ]),
        generatedAt,
        totalCount: input.papers.length,
        matchedCount: insights.length,
      })
    : createEmptyReportHtml({
        generatedAt,
        totalCount: input.papers.length,
      });

  return {
    generatedAt,
    entry: createReportEntry({
      generatedAt,
      html,
      matchedCount: insights.length,
      totalCount: input.papers.length,
    }),
    matchedCount: insights.length,
  };
}
