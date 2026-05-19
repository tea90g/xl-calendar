const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path");

const MAX_BACKUPS = 7;

function getCalendarDataDir() {
  return path.join(app.getPath("userData"), "data");
}

async function ensureCalendarDataDir() {
  const dir = getCalendarDataDir();
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

function getCalendarStatePath() {
  return path.join(getCalendarDataDir(), "calendar-data.json");
}

function getCalendarTempPath() {
  return path.join(getCalendarDataDir(), "calendar-data.tmp.json");
}


async function ensureBackupDir() {
  const dir = path.join(getCalendarDataDir(), "backups");
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

async function writeSnapshotBackup(data) {
  try {
    const backupDir = await ensureBackupDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `backup-${stamp}.json`);

    await fs.promises.writeFile(
      backupPath,
      JSON.stringify(data, null, 2),
      "utf-8"
    );

    const files = (await fs.promises.readdir(backupDir))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    const remove = files.slice(MAX_BACKUPS);

    await Promise.all(
      remove.map((file) =>
        fs.promises.unlink(path.join(backupDir, file)).catch(() => {})
      )
    );
  } catch (err) {
    console.error("backup failed:", err);
  }
}

const fs = require("fs");
const fsp = require("fs/promises");
const { execFile } = require("child_process");

const isDev = !app.isPackaged;

const DATA_FILE_NAME = "calendar-data.json";
const BACKUP_KEEP_COUNT = 20;

function getDataDir() {
  return getCalendarDataDir();
}

function getBackupDir() {
  return path.join(getDataDir(), "backups");
}

function getStateFilePath() {
  return path.join(getDataDir(), DATA_FILE_NAME);
}

function makeBackupFileName() {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
  return `backup-${stamp}.json`;
}

async function ensureDataFolders() {
  await fsp.mkdir(getBackupDir(), { recursive: true });
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function atomicWriteJson(filePath, data) {
  await ensureDataFolders();

  const tmpPath = `${filePath}.tmp`;
  const json = JSON.stringify(data, null, 2);

  await fsp.writeFile(tmpPath, json, "utf8");
  await fsp.rename(tmpPath, filePath);
}

async function rotateBackups() {
  try {
    const backupDir = getBackupDir();
    const files = (await fsp.readdir(backupDir))
      .filter((name) => name.startsWith("backup-") && name.endsWith(".json"))
      .sort()
      .reverse();

    const oldFiles = files.slice(BACKUP_KEEP_COUNT);
    await Promise.all(
      oldFiles.map((name) => fsp.unlink(path.join(backupDir, name)).catch(() => {}))
    );
  } catch {
    // 백업 정리는 실패해도 저장 자체를 막지 않습니다.
  }
}

async function createStateBackup(reason = "auto") {
  await ensureDataFolders();

  const statePath = getStateFilePath();
  if (!fs.existsSync(statePath)) return null;

  const backupPath = path.join(getBackupDir(), makeBackupFileName());
  await fsp.copyFile(statePath, backupPath);
  await rotateBackups();

  return {
    ok: true,
    reason,
    path: backupPath,
    fileName: path.basename(backupPath),
    createdAt: new Date().toISOString(),
  };
}

async function loadStateFromFile() {
  const statePath = getCalendarStatePath();

  try {
    const raw = await fs.promises.readFile(statePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveStateToFile(data) {
  const statePath = getCalendarStatePath();
  const tempPath = getCalendarTempPath();

  await ensureCalendarDataDir();

  const snapshot = {
    version: 1,
    savedAt: new Date().toISOString(),
    state: data?.state || data,
  };

  await fs.promises.writeFile(
    tempPath,
    JSON.stringify(snapshot, null, 2),
    "utf-8"
  );

  await fs.promises.rename(tempPath, statePath);

  await writeSnapshotBackup(snapshot);

  return { ok: true, path: statePath };
}

async function listStateBackups() {
  await ensureDataFolders();

  const backupDir = getBackupDir();
  const files = (await fsp.readdir(backupDir))
    .filter((name) => name.startsWith("backup-") && name.endsWith(".json"))
    .sort()
    .reverse();

  return files.map((name) => ({
    fileName: name,
    path: path.join(backupDir, name),
  }));
}

async function restoreStateBackup(fileName) {
  await ensureDataFolders();

  const safeName = path.basename(String(fileName || ""));
  if (!safeName.startsWith("backup-") || !safeName.endsWith(".json")) {
    return { ok: false, error: "Invalid backup file name." };
  }

  const backupPath = path.join(getBackupDir(), safeName);
  const data = await readJsonSafe(backupPath);

  if (!data) {
    return { ok: false, error: "Backup file is missing or broken." };
  }

  await createStateBackup("before-restore");
  await atomicWriteJson(getStateFilePath(), data);

  return {
    ok: true,
    data,
    restoredFrom: safeName,
  };
}

function runPowerShell(script) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 2500, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) return resolve("");
        resolve(String(stdout || "").trim());
      }
    );
  });
}

async function getActiveProgram() {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
}
"@;
$h = [Win32]::GetForegroundWindow();
$pid = 0;
[void][Win32]::GetWindowThreadProcessId($h, [ref]$pid);
try {
  $p = Get-Process -Id $pid -ErrorAction Stop;
  $name = $p.ProcessName;
  $title = $p.MainWindowTitle;
  if ([string]::IsNullOrWhiteSpace($title)) { $title = "" }
  Write-Output ($name + " " + $title).Trim();
} catch {
  Write-Output "";
}
`;
  return await runPowerShell(script);
}

async function getRunningPrograms() {
  const script = `
Get-Process |
  Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Trim().Length -gt 0 } |
  Sort-Object ProcessName -Unique |
  ForEach-Object { ($_.ProcessName + " " + $_.MainWindowTitle).Trim() }
`;
  const out = await runPowerShell(script);
  return [...new Set(out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean))];
}

function createWindow() {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#f4f4f4",
    autoHideMenuBar: true,
    title: "XL Calendar",

    // 메뉴바/못생긴 기본 타이틀 영역을 최대한 숨기고,
    // Windows 기본 최소화/최대화/닫기 버튼은 유지합니다.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#f4f4f4",
      symbolColor: "#777777",
      height: 34,
    },

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    // win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 프레임리스에 가까운 창에서도 빈 상단을 잡고 드래그할 수 있게 하는 보조 CSS.
  // 앱 버튼/입력칸은 클릭 가능하게 no-drag 처리합니다.
  win.webContents.on("did-finish-load", () => {
    win.webContents.insertCSS(`
      html, body, #root { min-height: 100%; overflow: hidden; }
      body::before {
        content: "";
        position: fixed;
        top: 0;
        left: 0;
        right: 140px;
        height: 28px;
        z-index: 2147483647;
        -webkit-app-region: drag;
        pointer-events: auto;
      }
      button, input, select, textarea, a, label, [role="button"] {
        -webkit-app-region: no-drag;
      }
    `).catch(() => {});
  });
}

ipcMain.handle("xl:get-active-program", async () => getActiveProgram());
ipcMain.handle("xl:get-running-programs", async () => getRunningPrograms());

ipcMain.handle("xl:load-state", async () => {
  console.log("[XL Calendar] load-state");
  return loadStateFromFile();
});

ipcMain.handle("xl:save-state", async (_event, data) => saveStateToFile(data));
ipcMain.handle("xl:create-backup", async (_event, reason) => createStateBackup(reason));
ipcMain.handle("xl:list-backups", async () => listStateBackups());
ipcMain.handle("xl:restore-backup", async (_event, fileName) => restoreStateBackup(fileName));

ipcMain.handle("save-calendar-state", async (_event, data) => saveStateToFile(data));

ipcMain.handle("load-calendar-state", async () => {
  console.log("[XL Calendar] load-calendar-state");
  return loadStateFromFile();
});


app.whenReady().then(async () => {
  await ensureCalendarDataDir().catch(() => {});

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
