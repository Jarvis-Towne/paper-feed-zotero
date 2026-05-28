/* global document, URLSearchParams, window */

(function () {
  function showMessage(message) {
    const frame = document.getElementById("paperfeed-ai-summary-frame");
    const messageBox = document.getElementById("paperfeed-ai-summary-message");
    if (frame) {
      frame.hidden = true;
    }
    if (messageBox) {
      messageBox.hidden = false;
      messageBox.textContent = message;
    }
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const date = params.get("date") || "";
    if (!date) {
      showMessage("Missing AI summary date.");
      return;
    }

    const api = window.Zotero?.PaperFeed?.api;
    if (!api?.getAiSummaryHtmlUrl) {
      showMessage("Paper Feed is not ready.");
      return;
    }

    document.title = `AI Literature Summary - ${date}`;
    const frame = document.getElementById("paperfeed-ai-summary-frame");
    if (!frame) {
      return;
    }
    frame.src = await api.getAiSummaryHtmlUrl(date);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void init();
    });
  } else {
    void init();
  }
})();
