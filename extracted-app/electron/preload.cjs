const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  saveCalendarState: (data) => ipcRenderer.invoke("xl:save-state", data),
  loadCalendarState: () => ipcRenderer.invoke("xl:load-state"),
  createCalendarBackup: (reason) => ipcRenderer.invoke("xl:create-backup", reason),
  listCalendarBackups: () => ipcRenderer.invoke("xl:list-backups"),
  restoreCalendarBackup: (fileName) => ipcRenderer.invoke("xl:restore-backup", fileName),
});

let activeProgram = "";

async function refreshActiveProgram() {
  try {
    activeProgram = await ipcRenderer.invoke("xl:get-active-program");
  } catch {
    activeProgram = "";
  }
}

refreshActiveProgram();
setInterval(refreshActiveProgram, 1000);

contextBridge.exposeInMainWorld("__XL_DESKTOP__", true);
contextBridge.exposeInMainWorld("__XL_GET_ACTIVE_PROGRAM__", () => activeProgram || "");
contextBridge.exposeInMainWorld("__XL_GET_RUNNING_PROGRAMS__", async () => {
  try {
    return await ipcRenderer.invoke("xl:get-running-programs");
  } catch {
    return [];
  }
});

setInterval(() => {
  globalThis.__XL_ACTIVE_PROGRAM__ = activeProgram || "";
}, 1000);

const xlStateApi = {
  saveCalendarState: (data) => ipcRenderer.invoke("xl:save-state", data),
  loadCalendarState: () => ipcRenderer.invoke("xl:load-state"),
  createCalendarBackup: (reason) => ipcRenderer.invoke("xl:create-backup", reason),
  listCalendarBackups: () => ipcRenderer.invoke("xl:list-backups"),
  restoreCalendarBackup: (fileName) => ipcRenderer.invoke("xl:restore-backup", fileName),
};

try {
  contextBridge.exposeInMainWorld("electron", xlStateApi);
} catch {}

try {
  contextBridge.exposeInMainWorld("__XL_STATE__", xlStateApi);
} catch {}
