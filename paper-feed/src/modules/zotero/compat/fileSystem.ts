function getPathParent(path: string) {
  if (typeof PathUtils !== "undefined" && typeof PathUtils.parent === "function") {
    return PathUtils.parent(path);
  }

  const normalized = path.replace(/[\\/]+$/, "");
  const lastSlash = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );

  if (lastSlash === -1) {
    return null;
  }

  return normalized.slice(0, lastSlash);
}

export async function pathExists(path: string) {
  if (typeof IOUtils !== "undefined" && typeof IOUtils.exists === "function") {
    return IOUtils.exists(path);
  }

  try {
    await Zotero.File.getContentsAsync(path, "utf-8");
    return true;
  } catch (_error) {
    return false;
  }
}

export async function ensureDirectory(path: string) {
  if (typeof Zotero === "undefined" || !Zotero.File) {
    throw new Error("Zotero.File is unavailable in this runtime");
  }

  await Zotero.File.createDirectoryIfMissingAsync(path);
}

export async function readTextFileIfExists(path: string) {
  if (!(await pathExists(path))) {
    return null;
  }

  const raw = await Zotero.File.getContentsAsync(path, "utf-8");
  return typeof raw === "string" ? raw : String(raw ?? "");
}

export async function writeTextFile(path: string, content: string) {
  const parent = getPathParent(path);
  if (parent) {
    await ensureDirectory(parent);
  }

  await Zotero.File.putContentsAsync(path, content, "utf-8");
}
