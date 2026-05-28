export const STORAGE_DIR_NAME = "paper-feed";
export const CONFIG_FILE_NAME = "paper-feed.config.json";
export const RUN_STATE_FILE_NAME = "paper-feed.state.json";
export const SNAPSHOT_FILE_NAME = "paper-feed.snapshot.json";
export const AI_SUMMARY_SNAPSHOT_FILE_NAME = "paper-feed.ai-summary.json";

function getDefaultDataDir() {
  if (typeof Zotero === "undefined" || !Zotero.DataDirectory?.dir) {
    throw new Error("Zotero.DataDirectory.dir is unavailable in this runtime");
  }

  return Zotero.DataDirectory.dir;
}

export function joinPath(...segments: string[]) {
  if (
    typeof PathUtils !== "undefined" &&
    typeof PathUtils.join === "function"
  ) {
    return PathUtils.join(...segments);
  }

  const separator = segments.some((segment) => segment.includes("\\"))
    ? "\\"
    : "/";

  return segments
    .map((segment, index) => {
      if (index === 0) {
        return segment.replace(/[\\/]+$/, "");
      }

      return segment.replace(/^[\\/]+|[\\/]+$/g, "");
    })
    .filter(Boolean)
    .join(separator);
}

export function getStorageDir(baseDir: string = getDefaultDataDir()) {
  return joinPath(baseDir, STORAGE_DIR_NAME);
}

export function getConfigFilePath(baseDir?: string) {
  return joinPath(getStorageDir(baseDir), CONFIG_FILE_NAME);
}

export function getRunStateFilePath(baseDir?: string) {
  return joinPath(getStorageDir(baseDir), RUN_STATE_FILE_NAME);
}

export function getSnapshotFilePath(baseDir?: string) {
  return joinPath(getStorageDir(baseDir), SNAPSHOT_FILE_NAME);
}

export function getAiSummarySnapshotFilePath(baseDir?: string) {
  return joinPath(getStorageDir(baseDir), AI_SUMMARY_SNAPSHOT_FILE_NAME);
}
