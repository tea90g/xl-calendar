const { contextBridge, ipcRenderer } = require("electron");

const stateApi = {
  saveCalendarState: (data) => ipcRenderer.invoke("xl:save-state", data),
  loadCalendarState: () => ipcRenderer.invoke("xl:load-state"),
  createCalendarBackup: (reason) => ipcRenderer.invoke("xl:create-backup", reason),
  listCalendarBackups: () => ipcRenderer.invoke("xl:list-backups"),
  restoreCalendarBackup: (fileName) => ipcRenderer.invoke("xl:restore-backup", fileName),
};

contextBridge.exposeInMainWorld("electron", stateApi);
contextBridge.exposeInMainWorld("__XL_STATE__", stateApi);
contextBridge.exposeInMainWorld("__XL_DESKTOP__", true);

contextBridge.exposeInMainWorld("__XL_GET_ACTIVE_PROGRAM__", async () => {
  try {
    return await ipcRenderer.invoke("xl:get-active-program");
  } catch {
    return "";
  }
});

contextBridge.exposeInMainWorld("__XL_GET_RUNNING_PROGRAMS__", async () => {
  try {
    return await ipcRenderer.invoke("xl:get-running-programs");
  } catch {
    return [];
  }
});


contextBridge.exposeInMainWorld("__XL_GOOGLE_AUTH__", async (payload) => {
  try {
    return await ipcRenderer.invoke("xl:google-auth", payload);
  } catch (err) {
    return { ok: false, error: err?.message || "Google 로그인 실패" };
  }
});


const autoLaunchApi = {
  get: () => ipcRenderer.invoke("xl:get-auto-launch"),
  set: (enabled) => ipcRenderer.invoke("xl:set-auto-launch", enabled),
};

contextBridge.exposeInMainWorld("__XL_AUTO_LAUNCH__", autoLaunchApi);
