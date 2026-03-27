import { readConfig, writeConfig } from "../storage/configStore";
import { readTextFileIfExists, writeTextFile } from "../zotero/compat/fileSystem";
import {
  importLegacyConfigFromFilePath,
  type LegacyImportResult,
} from "../migration/legacyImport";
import {
  DEFAULT_PORTABLE_CONFIG_FILE_NAME,
  ensurePortableConfigPath,
  parsePortableConfig,
  serializePortableConfig,
} from "./portableFormat";

export interface PortableConfigImportResult {
  sourceType: "portable-config";
  filePath: string;
}

export interface PortableConfigExportResult {
  filePath: string;
}

export type ConfigImportResult = PortableConfigImportResult | LegacyImportResult;

export async function importConfigFromPath(path: string): Promise<ConfigImportResult> {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    throw new Error("A configuration path is required.");
  }

  const lowerPath = normalizedPath.toLowerCase();
  if (
    lowerPath.endsWith("/journals.dat") ||
    lowerPath.endsWith("\\journals.dat") ||
    lowerPath.endsWith("/keywords.dat") ||
    lowerPath.endsWith("\\keywords.dat")
  ) {
    return importLegacyConfigFromFilePath(normalizedPath);
  }

  const raw = await readTextFileIfExists(normalizedPath);
  if (!raw) {
    throw new Error(`Config file not found: ${normalizedPath}`);
  }

  const config = parsePortableConfig(raw);
  await writeConfig(config);
  return {
    sourceType: "portable-config",
    filePath: normalizedPath,
  };
}

export async function exportConfigToPath(path: string): Promise<PortableConfigExportResult> {
  const config = await readConfig();
  const targetPath = ensurePortableConfigPath(path.trim() || DEFAULT_PORTABLE_CONFIG_FILE_NAME);
  await writeTextFile(targetPath, serializePortableConfig(config));
  return { filePath: targetPath };
}
