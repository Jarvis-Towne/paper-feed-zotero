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
  warnings: string[];
}

const BATCH_INSIGHT_SYSTEM_PROMPT = [
  "You are a world-class scientific literature screening and summarization assistant.",
  "Evaluate every paper independently against every user-defined research direction.",
  "Include every paper that directly matches at least one direction; the direction importance order controls ranking only, not the inclusion threshold.",
  "Discard papers that do not directly match any direction.",
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
const SCREENING_REQUEST_ATTEMPTS = 3;
const FINAL_HTML_ATTEMPTS = 3;
const MISSING_CONTENT_ERROR = "AI response did not include message content";
const RECOVERABLE_AI_HTTP_ERROR = /HTTP (408|429|5\d{2})\b/i;

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

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingContentError(error: unknown) {
  return formatError(error).includes(MISSING_CONTENT_ERROR);
}

function isRecoverableAiRequestError(error: unknown) {
  const message = formatError(error);
  return (
    RECOVERABLE_AI_HTTP_ERROR.test(message) ||
    /timed out|timeout/i.test(message) ||
    message.includes(MISSING_CONTENT_ERROR)
  );
}

function formatPaperRange(papers: FeedEntry[], offset: number) {
  const start = offset + 1;
  const end = offset + papers.length;
  return start === end ? `${start}` : `${start}-${end}`;
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
    "1. Evaluate every paper against every user-defined research direction.",
    "2. Include every paper that directly matches at least one direction. Importance order affects ranking only and must not exclude a direct match.",
    "3. Discard papers that do not directly match any direction; do not mention them.",
    "4. For every included paper, classify it by the most relevant user-defined direction.",
    "5. Write a 2-3 sentence Chinese summary focusing on problem, method/tool, and key finding.",
    "6. Return only a JSON array in this format:",
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

function directionOrderFromPrompt(prompt: string) {
  return prompt
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:\d+|[一二三四五六七八九十]+)[.、)\uff09]?\s*/, "")
        .trim(),
    )
    .filter(Boolean);
}

function directionSortIndex(direction: string, orderedDirections: string[]) {
  const normalized = direction.toLowerCase();
  const index = orderedDirections.findIndex((item) => {
    const ordered = item.toLowerCase();
    return normalized === ordered || normalized.includes(ordered);
  });

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function createLocalHtmlFallback(input: {
  config: AiSummaryConfig;
  papers: FeedEntry[];
  insights: PaperInsight[];
  totalCount: number;
  generatedAt: string;
}) {
  const paperMap = new Map(
    input.papers.map((paper, index) => [index + 1, paper]),
  );
  const orderedDirections = directionOrderFromPrompt(input.config.prompt);
  const grouped = new Map<
    string,
    Array<{ insight: PaperInsight; paper: FeedEntry }>
  >();

  for (const insight of input.insights) {
    const paper = paperMap.get(insight.id);
    if (!paper) {
      continue;
    }

    const direction = insight.matched_direction;
    const papers = grouped.get(direction) || [];
    papers.push({ insight, paper });
    grouped.set(direction, papers);
  }

  const groups = [...grouped.entries()].sort(
    ([left], [right]) =>
      directionSortIndex(left, orderedDirections) -
      directionSortIndex(right, orderedDirections),
  );

  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:850px;margin:0 auto;padding:20px;line-height:1.6;color:#2d3748;background:#ffffff;">',
    '<div style="border-bottom:2px solid #4A90E2;padding-bottom:10px;margin-bottom:20px;">',
    '<h2 style="margin:0;color:#1A365D;font-size:22px;">Daily AI Literature Insights</h2>',
    `<p style="margin:6px 0 0;color:#718096;font-size:13px;">生成时间: ${escapeXml(input.generatedAt)} | 今日候选文献: ${input.totalCount} 篇 | AI 选中: ${input.insights.length} 篇 | 本地 HTML 兜底生成</p>`,
    "</div>",
    ...groups.flatMap(([direction, papers], groupIndex) => [
      `<section style="margin:0 0 26px 0;"><h3 style="margin:0 0 12px 0;color:#1A365D;font-size:18px;border-left:4px solid #4A90E2;padding-left:10px;">${groupIndex + 1}. ${escapeXml(direction)}</h3>`,
      ...papers.map(({ insight, paper }) =>
        [
          '<article style="border:1px solid #E2E8F0;border-radius:8px;padding:14px 16px;margin:0 0 14px 0;background:#FDFDFD;">',
          `<h4 style="margin:0 0 8px 0;font-size:16px;line-height:1.4;"><a href="${escapeXml(paper.link)}" style="color:#2B6CB0;text-decoration:none;">${escapeXml(paper.title)}</a></h4>`,
          `<div style="font-size:12px;color:#718096;margin-bottom:10px;">${escapeXml(paper.authors || "")}${paper.authors ? " | " : ""}${escapeXml(paper.journal)}${paper.doi ? ` | DOI: ${escapeXml(paper.doi)}` : ""}</div>`,
          `<div style="font-size:14px;color:#2D3748;background:#F7FAFC;border-left:3px solid #63B3ED;padding:10px 12px;border-radius:0 4px 4px 0;">${removeIllegalXmlChars(insight.summary)}</div>`,
          "</article>",
        ].join(""),
      ),
      "</section>",
    ]),
    "</div>",
  ].join("");
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

function createWarningNoticeHtml(warnings: string[]) {
  if (!warnings.length) {
    return "";
  }

  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:800px;margin:0 auto 12px auto;padding:12px 14px;border:1px solid #F6AD55;border-left:4px solid #DD6B20;border-radius:6px;background:#FFFAF0;color:#744210;font-size:13px;line-height:1.5;">',
    "<strong>Paper Feed 注意:</strong> AI 最终排版请求连续失败，已使用本地 HTML 排版。论文筛选与逐篇摘要已经完成，不会因此遗漏论文。",
    '<ul style="margin:8px 0 0 18px;padding:0;">',
    ...warnings.map((warning) => `<li>${escapeXml(warning)}</li>`),
    "</ul>",
    "</div>",
  ].join("");
}

function withWarningNotice(html: string, warnings: string[]) {
  return `${createWarningNoticeHtml(warnings)}${html}`;
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

async function completeScreeningBatch(input: {
  config: AiSummaryConfig;
  papers: FeedEntry[];
  offset: number;
  client: ChatCompletionClient;
}) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SCREENING_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await input.client.complete([
        { role: "system", content: BATCH_INSIGHT_SYSTEM_PROMPT },
        {
          role: "user",
          content: createBatchInsightPrompt(
            input.config,
            input.papers,
            input.offset,
          ),
        },
      ]);
    } catch (error) {
      lastError = error;
      if (
        !isRecoverableAiRequestError(error) ||
        attempt === SCREENING_REQUEST_ATTEMPTS
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function collectScreeningInsights(input: {
  config: AiSummaryConfig;
  papers: FeedEntry[];
  offset: number;
  client: ChatCompletionClient;
}): Promise<PaperInsight[]> {
  try {
    const batchResult = await completeScreeningBatch(input);
    return parsePaperInsights(batchResult);
  } catch (error) {
    const canSplit =
      isMissingContentError(error) ||
      /HTTP (408|5\d{2})\b|timed out|timeout/i.test(formatError(error));
    if (!canSplit) {
      throw error;
    }

    const range = formatPaperRange(input.papers, input.offset);
    if (input.papers.length === 1) {
      throw new Error(
        `AI screening paper ${range} ${isMissingContentError(error) ? "returned empty content" : "failed"} after ${SCREENING_REQUEST_ATTEMPTS} attempts: ${formatError(error)}`,
      );
    }

    const midpoint = Math.ceil(input.papers.length / 2);
    const first = await collectScreeningInsights({
      ...input,
      papers: input.papers.slice(0, midpoint),
    });
    const second = await collectScreeningInsights({
      ...input,
      papers: input.papers.slice(midpoint),
      offset: input.offset + midpoint,
    });

    return [...first, ...second];
  }
}

async function completeFinalReportHtml(input: {
  config: AiSummaryConfig;
  papers: FeedEntry[];
  insights: PaperInsight[];
  totalCount: number;
  generatedAt: string;
  client: ChatCompletionClient;
}) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= FINAL_HTML_ATTEMPTS; attempt += 1) {
    try {
      return await input.client.complete([
        { role: "system", content: FINAL_HTML_SYSTEM_PROMPT },
        {
          role: "user",
          content: createFinalHtmlPrompt(input),
        },
      ]);
    } catch (error) {
      lastError = error;
      if (
        !isRecoverableAiRequestError(error) ||
        attempt === FINAL_HTML_ATTEMPTS
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function createFinalReportHtml(input: {
  config: AiSummaryConfig;
  papers: FeedEntry[];
  insights: PaperInsight[];
  totalCount: number;
  generatedAt: string;
  client: ChatCompletionClient;
  warnings: string[];
}) {
  try {
    return wrapAiHtml({
      html: await completeFinalReportHtml(input),
      generatedAt: input.generatedAt,
      totalCount: input.totalCount,
      matchedCount: input.insights.length,
    });
  } catch (error) {
    if (!isRecoverableAiRequestError(error)) {
      throw new Error(
        `AI final HTML synthesis failed after ${input.insights.length} selected papers: ${formatError(error)}`,
      );
    }

    input.warnings.push(
      `AI final HTML synthesis failed after ${FINAL_HTML_ATTEMPTS} attempts for ${input.insights.length} selected papers; used local HTML fallback: ${formatError(error).slice(0, 240)}`,
    );
    return createLocalHtmlFallback(input);
  }
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
  const batches = chunkPapers(input.papers);
  const warnings: string[] = [];

  for (const [batchIndex, batch] of batches.entries()) {
    try {
      allInsights.push(
        ...(await collectScreeningInsights({
          config: input.config,
          papers: batch.papers,
          offset: batch.offset,
          client: input.client,
        })),
      );
    } catch (error) {
      const start = batch.offset + 1;
      const end = batch.offset + batch.papers.length;
      throw new Error(
        `AI screening batch ${batchIndex + 1}/${batches.length} failed for papers ${start}-${end}: ${formatError(error)}`,
      );
    }
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
    });

  const html = withWarningNotice(
    insights.length
      ? await createFinalReportHtml({
          config: input.config,
          papers: input.papers,
          insights,
          totalCount: input.papers.length,
          generatedAt,
          client: input.client,
          warnings,
        })
      : createEmptyReportHtml({
          generatedAt,
          totalCount: input.papers.length,
        }),
    warnings,
  );

  return {
    generatedAt,
    entry: createReportEntry({
      generatedAt,
      html,
      matchedCount: insights.length,
      totalCount: input.papers.length,
    }),
    matchedCount: insights.length,
    warnings,
  };
}
