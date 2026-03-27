import type { PluginRunState } from "../domain/types";
import {
  readTextFileIfExists,
  writeTextFile,
} from "../zotero/compat/fileSystem";
import { getRunStateFilePath } from "./paths";

export const DEFAULT_PLUGIN_RUN_STATE: PluginRunState = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  generatedAt: null,
  seenIds: [],
  lastMatchCount: 0,
  storedItemCount: 0,
};

export function createDefaultRunState(): PluginRunState {
  return {
    ...DEFAULT_PLUGIN_RUN_STATE,
    seenIds: [],
  };
}

export function serializeRunState(state: PluginRunState) {
  return JSON.stringify(state, null, 2);
}

export function parseStoredRunState(raw: string): PluginRunState {
  const parsed = JSON.parse(raw) as Partial<PluginRunState>;

  return {
    lastRunAt: parsed.lastRunAt ?? null,
    lastSuccessAt: parsed.lastSuccessAt ?? null,
    lastError: parsed.lastError ?? null,
    generatedAt: parsed.generatedAt ?? null,
    seenIds: parsed.seenIds || [],
    lastMatchCount: parsed.lastMatchCount ?? 0,
    storedItemCount: parsed.storedItemCount ?? 0,
  };
}

export async function readRunState(baseDir?: string): Promise<PluginRunState> {
  const path = getRunStateFilePath(baseDir);
  const raw = await readTextFileIfExists(path);

  if (!raw) {
    return createDefaultRunState();
  }

  return parseStoredRunState(raw);
}

export async function writeRunState(
  state: PluginRunState,
  baseDir?: string,
): Promise<void> {
  const path = getRunStateFilePath(baseDir);
  await writeTextFile(path, serializeRunState(state));
}

export async function ensureRunStateInitialized(baseDir?: string) {
  const state = await readRunState(baseDir);
  await writeRunState(state, baseDir);
  return state;
}

export function createSuccessfulRunState(
  previous: PluginRunState,
  input: {
    generatedAt: string;
    lastError: string | null;
    seenIds: string[];
    lastMatchCount: number;
    storedItemCount: number;
  },
): PluginRunState {
  return {
    ...previous,
    lastRunAt: input.generatedAt,
    lastSuccessAt: input.generatedAt,
    lastError: input.lastError,
    generatedAt: input.generatedAt,
    seenIds: [...input.seenIds],
    lastMatchCount: input.lastMatchCount,
    storedItemCount: input.storedItemCount,
  };
}

export function createFailedRunState(
  previous: PluginRunState,
  input: {
    occurredAt: string;
    error: string;
  },
): PluginRunState {
  return {
    ...previous,
    lastRunAt: input.occurredAt,
    lastError: input.error,
  };
}
