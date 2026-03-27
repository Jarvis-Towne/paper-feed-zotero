import { config } from "../../../package.json";
import type { ConfigImportResult } from "../configExchange/configExchange";
import { DEFAULT_PORTABLE_CONFIG_FILE_NAME } from "../configExchange/portableFormat";
import type {
  FeedRuntimeSummary,
  JournalConfig,
  PluginConfig,
} from "../domain/types";
import { getString } from "../../utils/locale";
import { readConfig, writeConfig } from "../storage/configStore";
import {
  pickOpenFilePath,
  pickSaveFilePath,
} from "../zotero/compat/filePicker";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const JOURNAL_ACTION_COLUMN_WIDTH = 92;
const JOURNAL_COLUMN_MIN_WIDTH = 110;

type StatusTone = "ready" | "error" | "neutral";

function createHtmlElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tagName: K,
) {
  return doc.createElementNS(HTML_NS, tagName) as HTMLElementTagNameMap[K];
}

function setInputValue(doc: Document, id: string, value: string) {
  const input = doc.getElementById(id) as HTMLInputElement | null;
  if (!input) {
    return;
  }
  input.value = value;
}

function setCheckboxValue(doc: Document, id: string, value: boolean) {
  const input = doc.getElementById(id) as HTMLInputElement | null;
  if (!input) {
    return;
  }
  input.checked = value;
}

function setDisplayValue(
  doc: Document,
  id: string,
  value: string,
  options?: { title?: string },
) {
  const element = doc.getElementById(id) as HTMLElement | null;
  if (!element) {
    return;
  }

  element.textContent = value;
  if (options?.title) {
    element.setAttribute("title", options.title);
  } else {
    element.removeAttribute("title");
  }
}

function setButtonTooltip(doc: Document, id: string, value: string) {
  const button = doc.getElementById(id) as HTMLButtonElement | null;
  if (!button) {
    return;
  }

  button.setAttribute("title", value);
  button.setAttribute("aria-label", value);
}

function setButtonEnabled(doc: Document, id: string, enabled: boolean) {
  const button = doc.getElementById(id) as HTMLButtonElement | null;
  if (!button) {
    return;
  }

  button.disabled = !enabled;
}

function setMessage(doc: Document, message: string) {
  const element = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-ui-message`,
  );
  if (!element) {
    return;
  }

  element.textContent = message;
}

function getMessage(
  id: Parameters<typeof getString>[0],
  args?: Record<string, unknown>,
) {
  return args ? getString(id, { args }) : getString(id);
}

function getTextInputValue(doc: Document, id: string) {
  const input = doc.getElementById(id) as HTMLInputElement | null;
  return input?.value?.trim() || "";
}

function getCheckboxValue(doc: Document, id: string) {
  const input = doc.getElementById(id) as HTMLInputElement | null;
  return !!input?.checked;
}

function getNumberInputValue(doc: Document, id: string, fallback: number) {
  const input = doc.getElementById(id) as HTMLInputElement | null;
  const parsed = Number.parseInt(input?.value || "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getNotAvailableLabel() {
  return getMessage("pref-value-not-available");
}

function formatNullableValue(value: string | null) {
  return value || getNotAvailableLabel();
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return getNotAvailableLabel();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  } catch (_error) {
    return parsed.toLocaleString();
  }
}

function getServerStatusPresentation(): {
  label: string;
  detail: string;
  tone: StatusTone;
} {
  const state = addon.api.getServerState();
  if (!state) {
    return {
      label: getMessage("pref-status-not-initialized"),
      detail: "",
      tone: "neutral",
    };
  }

  if (state.status === "ready") {
    return {
      label: getMessage("pref-status-ready"),
      detail: "",
      tone: "ready",
    };
  }

  return {
    label: getMessage("pref-status-error"),
    detail: state.error || getNotAvailableLabel(),
    tone: "error",
  };
}

function applyServerStatusPresentation(doc: Document) {
  const badge = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-server-status`,
  ) as HTMLElement | null;
  const detail = doc.getElementById(
    `zotero-prefpane-${config.addonRef}-server-status-detail`,
  ) as HTMLElement | null;
  if (!badge || !detail) {
    return;
  }

  const presentation = getServerStatusPresentation();
  badge.textContent = presentation.label;
  badge.classList.remove("is-ready", "is-error", "is-neutral");
  badge.classList.add(`is-${presentation.tone}`);

  detail.textContent = presentation.detail;
  if (presentation.detail) {
    detail.setAttribute("title", presentation.detail);
  } else {
    detail.removeAttribute("title");
  }
}

function getJournalRowsContainer(doc: Document) {
  return doc.getElementById(
    `zotero-prefpane-${config.addonRef}-journal-rows`,
  ) as HTMLTableSectionElement | null;
}

function getKeywordRowsContainer(doc: Document) {
  return doc.getElementById(
    `zotero-prefpane-${config.addonRef}-keyword-rows`,
  ) as HTMLTableSectionElement | null;
}

function getJournalTableShell(doc: Document) {
  return doc.getElementById(
    `zotero-prefpane-${config.addonRef}-journal-table-shell`,
  ) as HTMLDivElement | null;
}

function getJournalColumn(doc: Document, column: "name" | "url") {
  return doc.getElementById(
    `zotero-prefpane-${config.addonRef}-journal-col-${column}`,
  ) as HTMLTableColElement | null;
}

function getJournalNameResizer(doc: Document) {
  return doc.getElementById(
    `zotero-prefpane-${config.addonRef}-journal-name-resizer`,
  ) as HTMLDivElement | null;
}

function parsePixelWidth(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getJournalResizableWidth(doc: Document) {
  const shell = getJournalTableShell(doc);
  if (!shell) {
    return 0;
  }

  const shellWidth =
    shell.clientWidth || Math.ceil(shell.getBoundingClientRect().width);

  return Math.max(0, shellWidth - JOURNAL_ACTION_COLUMN_WIDTH);
}

function applyJournalColumnWidths(doc: Document, requestedNameWidth?: number) {
  const nameCol = getJournalColumn(doc, "name");
  const urlCol = getJournalColumn(doc, "url");
  if (!nameCol || !urlCol) {
    return;
  }

  const availableWidth = getJournalResizableWidth(doc);
  if (!availableWidth) {
    return;
  }

  const minWidth = Math.max(
    72,
    Math.min(JOURNAL_COLUMN_MIN_WIDTH, Math.floor(availableWidth / 3)),
  );
  const existingNameWidth =
    requestedNameWidth ??
    parsePixelWidth(nameCol.style.width) ??
    Math.round(availableWidth * 0.26);
  const maxNameWidth = Math.max(minWidth, availableWidth - minWidth);
  const clampedNameWidth = Math.min(
    Math.max(existingNameWidth, minWidth),
    maxNameWidth,
  );
  const urlWidth = Math.max(minWidth, availableWidth - clampedNameWidth);

  nameCol.style.width = `${Math.round(clampedNameWidth)}px`;
  urlCol.style.width = `${Math.round(urlWidth)}px`;
}

function scheduleJournalColumnLayout(window: Window) {
  window.setTimeout(() => {
    applyJournalColumnWidths(window.document);
  }, 0);
}

function bindJournalColumnResizer(window: Window) {
  const doc = window.document;
  const handle = getJournalNameResizer(doc);
  if (!handle || handle.dataset.paperfeedBound === "true") {
    return;
  }

  handle.dataset.paperfeedBound = "true";

  handle.addEventListener("mousedown", (event: MouseEvent) => {
    event.preventDefault();

    const nameCol = getJournalColumn(doc, "name");
    const startNameWidth =
      parsePixelWidth(nameCol?.style.width || "") ??
      Math.round(getJournalResizableWidth(doc) * 0.32);
    const startX = event.clientX;

    const onMouseMove = (moveEvent: MouseEvent) => {
      applyJournalColumnWidths(doc, startNameWidth + moveEvent.clientX - startX);
    };

    const cleanup = () => {
      doc.documentElement?.classList.remove("paperfeed-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", cleanup);
      window.removeEventListener("blur", cleanup);
    };

    doc.documentElement?.classList.add("paperfeed-resizing");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", cleanup);
    window.addEventListener("blur", cleanup);
  });

  window.addEventListener("resize", () => {
    applyJournalColumnWidths(doc);
  });
}

function bindCopyButton(
  doc: Document,
  buttonId: string,
  resolveValue: () => string | null,
) {
  const button = doc.getElementById(buttonId) as HTMLButtonElement | null;
  if (!button || button.dataset.paperfeedBound === "true") {
    return;
  }

  button.dataset.paperfeedBound = "true";
  setButtonTooltip(doc, buttonId, getMessage("pref-copy-url"));
  button.addEventListener("click", () => {
    const value = resolveValue();
    if (!value) {
      setMessage(doc, getMessage("pref-ui-message-url-missing"));
      return;
    }

    copyTextToClipboard(value);
    setMessage(doc, getMessage("pref-ui-message-url-copied", { url: value }));
  });
}

function createJournalInput(
  doc: Document,
  type: "name" | "url",
  value: string,
) {
  const input = createHtmlElement(doc, "input");
  input.type = "text";
  input.value = value;
  input.className = "paperfeed-journal-input";
  input.setAttribute("data-paperfeed-journal-field", type);
  return input;
}

function createJournalRow(
  doc: Document,
  journal: JournalConfig = { name: "", url: "" },
) {
  const row = createHtmlElement(doc, "tr");
  row.setAttribute("data-paperfeed-journal-row", "true");

  const nameCell = createHtmlElement(doc, "td");
  nameCell.appendChild(createJournalInput(doc, "name", journal.name));

  const urlCell = createHtmlElement(doc, "td");
  urlCell.appendChild(createJournalInput(doc, "url", journal.url));

  const actionCell = createHtmlElement(doc, "td");
  actionCell.className = "paperfeed-journal-action-cell";
  const removeButton = createHtmlElement(doc, "button");
  removeButton.type = "button";
  removeButton.textContent = getMessage("pref-journal-remove");
  removeButton.addEventListener("click", () => {
    row.remove();

    const container = getJournalRowsContainer(doc);
    if (!container?.children.length) {
      container?.appendChild(createJournalRow(doc));
    }
  });
  actionCell.appendChild(removeButton);

  row.append(nameCell, urlCell, actionCell);
  return row;
}

function renderJournalRows(doc: Document, journals: JournalConfig[]) {
  const container = getJournalRowsContainer(doc);
  if (!container) {
    return;
  }

  container.replaceChildren();

  const rows = journals.length ? journals : [{ name: "", url: "" }];
  for (const journal of rows) {
    container.appendChild(createJournalRow(doc, journal));
  }
}

function createKeywordInput(doc: Document, value: string) {
  const input = createHtmlElement(doc, "input");
  input.type = "text";
  input.value = value;
  input.className = "paperfeed-journal-input";
  input.setAttribute("data-paperfeed-keyword-field", "rule");
  return input;
}

function createKeywordRow(doc: Document, keyword = "") {
  const row = createHtmlElement(doc, "tr");
  row.setAttribute("data-paperfeed-keyword-row", "true");

  const keywordCell = createHtmlElement(doc, "td");
  keywordCell.appendChild(createKeywordInput(doc, keyword));

  const actionCell = createHtmlElement(doc, "td");
  actionCell.className = "paperfeed-journal-action-cell";
  const removeButton = createHtmlElement(doc, "button");
  removeButton.type = "button";
  removeButton.textContent = getMessage("pref-journal-remove");
  removeButton.addEventListener("click", () => {
    row.remove();

    const container = getKeywordRowsContainer(doc);
    if (!container?.children.length) {
      container?.appendChild(createKeywordRow(doc));
    }
  });
  actionCell.appendChild(removeButton);

  row.append(keywordCell, actionCell);
  return row;
}

function renderKeywordRows(doc: Document, keywordQueries: string[]) {
  const container = getKeywordRowsContainer(doc);
  if (!container) {
    return;
  }

  container.replaceChildren();

  const rows = keywordQueries.length ? keywordQueries : [""];
  for (const keyword of rows) {
    container.appendChild(createKeywordRow(doc, keyword));
  }
}

function readJournalRows(doc: Document) {
  const container = getJournalRowsContainer(doc);
  if (!container) {
    return [] as JournalConfig[];
  }

  return (
    Array.from(
      container.querySelectorAll(`tr[data-paperfeed-journal-row="true"]`),
    ) as HTMLTableRowElement[]
  )
    .map((row) => {
      const nameInput = row.querySelector(
        `input[data-paperfeed-journal-field="name"]`,
      ) as HTMLInputElement | null;
      const urlInput = row.querySelector(
        `input[data-paperfeed-journal-field="url"]`,
      ) as HTMLInputElement | null;

      return {
        name: nameInput?.value?.trim() || "",
        url: urlInput?.value?.trim() || "",
      };
    })
    .filter((journal) => !!journal.url);
}

function readKeywordRows(doc: Document) {
  const container = getKeywordRowsContainer(doc);
  if (!container) {
    return [] as string[];
  }

  return (
    Array.from(
      container.querySelectorAll(`tr[data-paperfeed-keyword-row="true"]`),
    ) as HTMLTableRowElement[]
  )
    .map((row) => {
      const input = row.querySelector(
        `input[data-paperfeed-keyword-field="rule"]`,
      ) as HTMLInputElement | null;
      return input?.value?.trim() || "";
    })
    .filter((keyword) => keyword.length > 0 && !keyword.startsWith("#"));
}

function readConfigFromForm(doc: Document): PluginConfig {
  return {
    profileName:
      getTextInputValue(doc, `zotero-prefpane-${config.addonRef}-profile-name`) ||
      "default",
    journals: readJournalRows(doc),
    keywordQueries: readKeywordRows(doc),
    autoFetchEnabled: getCheckboxValue(
      doc,
      `zotero-prefpane-${config.addonRef}-auto-fetch-enabled`,
    ),
    autoFetchIntervalHours: getNumberInputValue(
      doc,
      `zotero-prefpane-${config.addonRef}-auto-fetch-interval`,
      6,
    ),
    subscription: {
      name:
        getTextInputValue(
          doc,
          `zotero-prefpane-${config.addonRef}-subscription-name`,
        ) || "Paper Feed",
      refreshIntervalHours: getNumberInputValue(
        doc,
        `zotero-prefpane-${config.addonRef}-subscription-refresh-interval`,
        6,
      ),
      cleanupReadAfterDays: getNumberInputValue(
        doc,
        `zotero-prefpane-${config.addonRef}-subscription-cleanup-read`,
        30,
      ),
      cleanupUnreadAfterDays: getNumberInputValue(
        doc,
        `zotero-prefpane-${config.addonRef}-subscription-cleanup-unread`,
        365,
      ),
    },
  };
}

async function fillConfigFields(doc: Document) {
  const storedConfig = await readConfig();

  setInputValue(
    doc,
    `zotero-prefpane-${config.addonRef}-profile-name`,
    storedConfig.profileName,
  );
  renderJournalRows(doc, storedConfig.journals);
  renderKeywordRows(doc, storedConfig.keywordQueries);
  setCheckboxValue(
    doc,
    `zotero-prefpane-${config.addonRef}-auto-fetch-enabled`,
    storedConfig.autoFetchEnabled,
  );
  setInputValue(
    doc,
    `zotero-prefpane-${config.addonRef}-auto-fetch-interval`,
    String(storedConfig.autoFetchIntervalHours),
  );
  setInputValue(
    doc,
    `zotero-prefpane-${config.addonRef}-subscription-name`,
    storedConfig.subscription.name,
  );
  setInputValue(
    doc,
    `zotero-prefpane-${config.addonRef}-subscription-refresh-interval`,
    String(storedConfig.subscription.refreshIntervalHours),
  );
  setInputValue(
    doc,
    `zotero-prefpane-${config.addonRef}-subscription-cleanup-read`,
    String(storedConfig.subscription.cleanupReadAfterDays),
  );
  setInputValue(
    doc,
    `zotero-prefpane-${config.addonRef}-subscription-cleanup-unread`,
    String(storedConfig.subscription.cleanupUnreadAfterDays),
  );
}

function applyRuntimeSummary(doc: Document, summary: FeedRuntimeSummary) {
  setDisplayValue(
    doc,
    `zotero-prefpane-${config.addonRef}-generated-at`,
    formatTimestamp(summary.generatedAt),
    { title: summary.generatedAt || undefined },
  );
  setDisplayValue(
    doc,
    `zotero-prefpane-${config.addonRef}-last-run-at`,
    formatTimestamp(summary.lastRunAt),
    { title: summary.lastRunAt || undefined },
  );
  setDisplayValue(
    doc,
    `zotero-prefpane-${config.addonRef}-last-success-at`,
    formatTimestamp(summary.lastSuccessAt),
    { title: summary.lastSuccessAt || undefined },
  );
  setDisplayValue(
    doc,
    `zotero-prefpane-${config.addonRef}-journal-count`,
    String(summary.journalCount),
  );
  setDisplayValue(
    doc,
    `zotero-prefpane-${config.addonRef}-query-count`,
    String(summary.queryCount),
  );
  setDisplayValue(
    doc,
    `zotero-prefpane-${config.addonRef}-stored-item-count`,
    String(summary.storedItemCount),
  );
  setDisplayValue(
    doc,
    `zotero-prefpane-${config.addonRef}-last-match-count`,
    String(summary.lastMatchCount),
  );
  setDisplayValue(
    doc,
    `zotero-prefpane-${config.addonRef}-last-error`,
    summary.lastError || getMessage("pref-last-error-empty"),
    { title: summary.lastError || undefined },
  );
}

async function refreshPreferencePane(
  window: Window,
  options?: { keepMessage?: boolean },
) {
  const doc = window.document;
  const state = addon.api.getServerState();
  const summary = await addon.api.getFeedRuntimeSummary();

  await fillConfigFields(doc);

  applyServerStatusPresentation(doc);
  setDisplayValue(
    doc,
    `zotero-prefpane-${config.addonRef}-rss-url`,
    formatNullableValue(state?.rssUrl || null),
    { title: state?.rssUrl || undefined },
  );
  setButtonEnabled(
    doc,
    `zotero-prefpane-${config.addonRef}-copy-rss-url`,
    !!state?.rssUrl,
  );

  applyRuntimeSummary(doc, summary);

  if (state) {
    state.generatedAt = summary.generatedAt;
    state.storedItemCount = summary.storedItemCount;
  }

  scheduleJournalColumnLayout(window);

  if (!options?.keepMessage) {
    setMessage(doc, getString("pref-ui-message-idle"));
  }
}

function copyTextToClipboard(text: string) {
  const helper = (Components.classes as any)[
    "@mozilla.org/widget/clipboardhelper;1"
  ].getService(Components.interfaces.nsIClipboardHelper);
  helper.copyString(text);
}

function openExternalUrl(url: string) {
  if (typeof Zotero.launchURL === "function") {
    Zotero.launchURL(url);
    return;
  }

  const ioService = (Components.classes as any)[
    "@mozilla.org/network/io-service;1"
  ].getService(Components.interfaces.nsIIOService);
  const externalProtocolService = (Components.classes as any)[
    "@mozilla.org/uriloader/external-protocol-service;1"
  ].getService(Components.interfaces.nsIExternalProtocolService);
  const uri = ioService.newURI(url);
  externalProtocolService.loadURI(uri);
}

function bindExternalLink(doc: Document, id: string, fallbackUrl: string) {
  const link = doc.getElementById(id) as HTMLAnchorElement | null;
  if (!link || link.dataset.paperfeedBound === "true") {
    return;
  }

  link.dataset.paperfeedBound = "true";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const url = link.href || fallbackUrl;
    openExternalUrl(url);
  });
}

function formatImportResultMessage(result: ConfigImportResult) {
  if (result.sourceType === "portable-config") {
    return getMessage("pref-ui-message-import-success", {
      path: result.filePath,
    });
  }

  if (result.journalFileFound && result.keywordFileFound) {
    return getMessage("pref-ui-message-import-success-both", {
      path: result.directoryPath,
      journalCount: result.importedJournals,
      keywordCount: result.importedKeywords,
    });
  }

  if (result.journalFileFound) {
    return getMessage("pref-ui-message-import-success-journals", {
      path: result.directoryPath,
      journalCount: result.importedJournals,
    });
  }

  return getMessage("pref-ui-message-import-success-keywords", {
    path: result.directoryPath,
    keywordCount: result.importedKeywords,
  });
}

function bindPreferenceActions(window: Window) {
  const doc = window.document;
  const root = doc.documentElement;
  const bindingKey = `data-${config.addonRef}-bound`;
  if (root?.getAttribute(bindingKey) === "true") {
    return;
  }
  root?.setAttribute(bindingKey, "true");

  bindJournalColumnResizer(window);
  bindCopyButton(
    doc,
    `zotero-prefpane-${config.addonRef}-copy-rss-url`,
    () => addon.api.getServerState()?.rssUrl || null,
  );
  bindExternalLink(
    doc,
    `zotero-prefpane-${config.addonRef}-github-link`,
    "https://github.com/Jarvis-Towne/paper-feed-zotero",
  );

  doc
    .getElementById(`zotero-prefpane-${config.addonRef}-add-journal-row`)
    ?.addEventListener("click", () => {
      getJournalRowsContainer(doc)?.appendChild(createJournalRow(doc));
      scheduleJournalColumnLayout(window);
    });

  doc
    .getElementById(`zotero-prefpane-${config.addonRef}-add-keyword-row`)
    ?.addEventListener("click", () => {
      getKeywordRowsContainer(doc)?.appendChild(createKeywordRow(doc));
    });

  doc
    .getElementById(`zotero-prefpane-${config.addonRef}-import-config`)
    ?.addEventListener("click", async () => {
      try {
        const path = await pickOpenFilePath(
          window,
          getMessage("pref-import-config-dialog-title"),
        );
        if (!path) {
          setMessage(doc, getMessage("pref-ui-message-import-cancelled"));
          return;
        }

        setMessage(doc, getMessage("pref-ui-message-import-running"));
        const result = await addon.api.importConfigFromPath(path);
        await addon.api.syncAutoFetchScheduler("config-change");
        await refreshPreferencePane(window, { keepMessage: true });
        setMessage(doc, formatImportResultMessage(result));
      } catch (error) {
        setMessage(
          doc,
          getMessage("pref-ui-message-import-failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });

  doc
    .getElementById(`zotero-prefpane-${config.addonRef}-export-config`)
    ?.addEventListener("click", async () => {
      try {
        await writeConfig(readConfigFromForm(doc));
        await addon.api.syncAutoFetchScheduler("config-change");
        const path = await pickSaveFilePath(
          window,
          getMessage("pref-export-config-dialog-title"),
          DEFAULT_PORTABLE_CONFIG_FILE_NAME,
        );
        if (!path) {
          setMessage(doc, getMessage("pref-ui-message-export-cancelled"));
          return;
        }

        const result = await addon.api.exportConfigToPath(path);
        await refreshPreferencePane(window, { keepMessage: true });
        setMessage(
          doc,
          getMessage("pref-ui-message-export-success", {
            path: result.filePath,
          }),
        );
      } catch (error) {
        setMessage(
          doc,
          getMessage("pref-ui-message-export-failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });

  doc
    .getElementById(`zotero-prefpane-${config.addonRef}-save-config`)
    ?.addEventListener("click", async () => {
      try {
        await writeConfig(readConfigFromForm(doc));
        await addon.api.syncAutoFetchScheduler("config-change");
        await refreshPreferencePane(window, { keepMessage: true });
        setMessage(doc, getMessage("pref-ui-message-save-success"));
      } catch (error) {
        setMessage(
          doc,
          getMessage("pref-ui-message-save-failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });

  doc
    .getElementById(`zotero-prefpane-${config.addonRef}-run-fetch`)
    ?.addEventListener("click", async () => {
      try {
        setMessage(doc, getMessage("pref-ui-message-fetch-running"));
        await writeConfig(readConfigFromForm(doc));
        const result = await addon.api.rebuildFeedCache();
        await addon.api.syncAutoFetchScheduler("post-run");
        await refreshPreferencePane(window, { keepMessage: true });
        setMessage(
          doc,
          getMessage("pref-ui-message-fetch-success", {
            newCount: result.newItems.length,
            totalCount: result.items.length,
          }),
        );
      } catch (error) {
        await addon.api.syncAutoFetchScheduler("post-run");
        await refreshPreferencePane(window, { keepMessage: true });
        setMessage(
          doc,
          getMessage("pref-ui-message-fetch-failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });

  doc
    .getElementById(`zotero-prefpane-${config.addonRef}-apply-feed`)
    ?.addEventListener("click", async () => {
      try {
        setMessage(doc, getMessage("pref-ui-message-feed-running"));
        await writeConfig(readConfigFromForm(doc));
        await addon.api.syncAutoFetchScheduler("config-change");
        const result = await addon.api.provisionManagedFeedSubscription();
        await refreshPreferencePane(window, { keepMessage: true });
        setMessage(
          doc,
          getMessage("pref-ui-message-feed-success", {
            action: result.action,
            libraryID: result.libraryID,
            url: result.url,
          }),
        );
      } catch (error) {
        setMessage(
          doc,
          getMessage("pref-ui-message-feed-failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });

  doc
    .getElementById(`zotero-prefpane-${config.addonRef}-refresh-status`)
    ?.addEventListener("click", async () => {
      await refreshPreferencePane(window, { keepMessage: true });
      setMessage(doc, getMessage("pref-ui-message-status-refreshed"));
    });
}

export function registerPreferencePane() {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

export async function registerPrefsScripts(window: Window) {
  addon.data.prefs = { window };

  bindPreferenceActions(window);
  await refreshPreferencePane(window);
}
