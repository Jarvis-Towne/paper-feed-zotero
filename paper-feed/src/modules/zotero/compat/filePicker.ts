function createFilePicker(
  window: Window,
  title: string,
  mode: number,
) {
  const filePicker = (Components.classes as any)[
    "@mozilla.org/filepicker;1"
  ].createInstance(Components.interfaces.nsIFilePicker);
  const browsingContext = (window as any)?.browsingContext ?? null;

  filePicker.init(browsingContext, title, mode);
  filePicker.appendFilters(Components.interfaces.nsIFilePicker.filterAll);
  return filePicker;
}

async function openAndResolvePath(filePicker: any, mode: "open" | "save") {
  const result = await new Promise<number>((resolve) => {
    filePicker.open(resolve);
  });

  if (mode === "open") {
    if (result !== Components.interfaces.nsIFilePicker.returnOK) {
      return null;
    }
  } else if (
    result !== Components.interfaces.nsIFilePicker.returnOK &&
    result !== Components.interfaces.nsIFilePicker.returnReplace
  ) {
    return null;
  }

  return filePicker.file?.path || null;
}

export async function pickOpenFilePath(window: Window, title: string) {
  const filePicker = createFilePicker(
    window,
    title,
    Components.interfaces.nsIFilePicker.modeOpen,
  );
  return openAndResolvePath(filePicker, "open");
}

export async function pickSaveFilePath(
  window: Window,
  title: string,
  defaultFileName: string,
) {
  const filePicker = createFilePicker(
    window,
    title,
    Components.interfaces.nsIFilePicker.modeSave,
  );
  filePicker.defaultString = defaultFileName;
  return openAndResolvePath(filePicker, "save");
}
