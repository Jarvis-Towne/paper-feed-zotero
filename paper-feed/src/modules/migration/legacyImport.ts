import type { PluginConfig } from "../domain/types";
import {
  mergeImportedConfig,
  parseLineSeparatedValues,
  readConfig,
  writeConfig,
} from "../storage/configStore";
import { joinPath } from "../storage/paths";
import { readTextFileIfExists } from "../zotero/compat/fileSystem";

export const LEGACY_JOURNALS_FILE_NAME = "journals.dat";
export const LEGACY_KEYWORDS_FILE_NAME = "keywords.dat";

export interface LegacyImportResult {
  sourceType: "legacy-dat";
  directoryPath: string;
  config: PluginConfig;
  importedJournals: number;
  importedKeywords: number;
  journalFileFound: boolean;
  keywordFileFound: boolean;
}

function countImportedValues(content: string | null | undefined) {
  if (content === null || content === undefined) {
    return 0;
  }

  return parseLineSeparatedValues(content).length;
}

export function resolveLegacyImportResult(input: {
  directoryPath: string;
  currentConfig: PluginConfig;
  journalsContent?: string | null;
  keywordContent?: string | null;
}): LegacyImportResult {
  const journalFileFound =
    input.journalsContent !== undefined && input.journalsContent !== null;
  const keywordFileFound =
    input.keywordContent !== undefined && input.keywordContent !== null;

  if (!journalFileFound && !keywordFileFound) {
    throw new Error(
      `No legacy config files were found in ${input.directoryPath}. Expected ${LEGACY_JOURNALS_FILE_NAME} and/or ${LEGACY_KEYWORDS_FILE_NAME}.`,
    );
  }

  return {
    sourceType: "legacy-dat",
    directoryPath: input.directoryPath,
    config: mergeImportedConfig(input.currentConfig, {
      journalsContent: input.journalsContent,
      keywordContent: input.keywordContent,
    }),
    importedJournals: countImportedValues(input.journalsContent),
    importedKeywords: countImportedValues(input.keywordContent),
    journalFileFound,
    keywordFileFound,
  };
}

export async function previewLegacyImportFromDirectory(
  directoryPath: string,
  currentConfig?: PluginConfig,
) {
  const config = currentConfig ?? (await readConfig());
  const [journalsContent, keywordContent] = await Promise.all([
    readTextFileIfExists(joinPath(directoryPath, LEGACY_JOURNALS_FILE_NAME)),
    readTextFileIfExists(joinPath(directoryPath, LEGACY_KEYWORDS_FILE_NAME)),
  ]);

  return resolveLegacyImportResult({
    directoryPath,
    currentConfig: config,
    journalsContent,
    keywordContent,
  });
}

export async function importLegacyConfigFromDirectory(directoryPath: string) {
  const result = await previewLegacyImportFromDirectory(directoryPath);
  await writeConfig(result.config);
  return result;
}

function getPathParent(path: string) {
  const normalized = path.replace(/[\\/]+$/, "");
  const lastSlash = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );

  return lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
}

export async function importLegacyConfigFromFilePath(path: string) {
  const directoryPath = getPathParent(path);
  if (!directoryPath) {
    throw new Error(`Cannot resolve legacy config directory from ${path}`);
  }

  return importLegacyConfigFromDirectory(directoryPath);
}
