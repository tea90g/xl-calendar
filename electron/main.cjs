const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

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
    const utf8Script = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 > $null; ${script}`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", utf8Script],
      { windowsHide: true, timeout: 2500, maxBuffer: 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        if (error) return resolve("");
        resolve(String(stdout || "").trim());
      }
    );
  });
}

async function getActiveProgram() {
  try {
    const mod = await import("active-win");
    const activeWin = mod.default || mod.activeWindow || mod;
    const result = await activeWin();

    const ownerName = String(result?.owner?.name || "").trim();
    const title = String(result?.title || "").trim();

    return ownerName || title || "";
  } catch {
    return "";
  }
}

async function getRunningPrograms() {
  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
Get-Process |
  Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Trim().Length -gt 0 } |
  Sort-Object ProcessName -Unique |
  ForEach-Object { $_.ProcessName }
`;
  const out = await runPowerShell(script);

  const ignored = new Set([
    "applicationframehost",
    "calendar clone app",
    "cmd",
    "conhost",
    "electron",
    "explorer",
    "powershell",
    "pwsh",
    "windowsterminal",
    "xl calendar",
  ]);

  return [...new Set(out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean))]
    .filter((name) => !ignored.has(name.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}



function normalizeCaptureName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.exe\b/g, "")
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龥]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldIgnoreCaptureProgram(detail) {
  const processName = normalizeCaptureName(detail?.processName);
  const label = normalizeCaptureName(detail?.label || `${detail?.processName || ""} ${detail?.title || ""}`);
  const combined = `${processName} ${label}`.trim();

  if (!combined) return true;

  const ignored = [
    "xl calendar",
    "calendar clone app",
    "electron",
    "powershell",
    "pwsh",
    "cmd",
    "conhost",
    "windowsterminal",
    "windows terminal",
    "applicationframehost",
  ];

  return ignored.some((item) => combined === item || combined.includes(item));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureActiveProgram(durationMs = 10000) {
  const endAt = Date.now() + Math.max(2000, Number(durationMs) || 10000);
  let lastDetail = null;

  while (Date.now() < endAt) {
    const detail = await getActiveProgramDetail();
    lastDetail = detail;

    if (!shouldIgnoreCaptureProgram(detail)) {
      return {
        ok: true,
        processName: String(detail.processName || "").trim(),
        title: String(detail.title || "").trim(),
        label: String(detail.label || "").trim(),
      };
    }

    await wait(250);
  }

  return {
    ok: false,
    processName: String(lastDetail?.processName || "").trim(),
    title: String(lastDetail?.title || "").trim(),
    label: String(lastDetail?.label || "").trim(),
  };
}



function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function postForm(url, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const target = new URL(url);

    const req = https.request(
      {
        method: "POST",
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(raw || "{}");
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
            else reject(new Error(json.error_description || json.error || raw || `HTTP ${res.statusCode}`));
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function listenOnceForOAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
        if (reqUrl.pathname !== "/oauth2callback") {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }

        const code = reqUrl.searchParams.get("code");
        const error = reqUrl.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<html><body><h2>XL Calendar Google Drive 연결 실패</h2><p>앱으로 돌아가 다시 시도해 주세요.</p></body></html>");
          server.close();
          reject(new Error(error));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body><h2>XL Calendar Google Drive 연결 완료</h2><p>이 창은 닫아도 됩니다.</p></body></html>");
        server.close();
        resolve(code || "");
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

async function startGoogleDesktopOAuth({ clientId, clientSecret, scope }) {
  const safeClientId = String(clientId || "").trim();
  const safeScope = String(scope || "https://www.googleapis.com/auth/drive.file").trim();
  const safeClientSecret = String(clientSecret || "").trim();

  if (!safeClientId) {
    return { ok: false, error: "Google OAuth Client ID가 비어 있어요." };
  }

  let server;
  try {
    const opened = await listenOnceForOAuthCode();
    server = opened.server;
    const port = opened.port;
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

    const codeVerifier = base64Url(crypto.randomBytes(32));
    const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
    const state = base64Url(crypto.randomBytes(16));

    const codePromise = new Promise((resolve, reject) => {
      server.removeAllListeners("request");
      server.on("request", (req, res) => {
        try {
          const reqUrl = new URL(req.url || "/", redirectUri);
          if (reqUrl.pathname !== "/oauth2callback") {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not found");
            return;
          }

          const returnedState = reqUrl.searchParams.get("state");
          const code = reqUrl.searchParams.get("code");
          const error = reqUrl.searchParams.get("error");

          if (error || returnedState !== state || !code) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<html><body><h2>XL Calendar Google Drive 연결 실패</h2><p>앱으로 돌아가 다시 시도해 주세요.</p></body></html>");
            server.close();
            reject(new Error(error || "OAuth state mismatch"));
            return;
          }

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<html><body><h2>XL Calendar Google Drive 연결 완료</h2><p>이 창은 닫아도 됩니다.</p></body></html>");
          server.close();
          resolve(code);
        } catch (err) {
          server.close();
          reject(err);
        }
      });
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", safeClientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", safeScope);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", state);

    await shell.openExternal(authUrl.toString());

    const code = await codePromise;

    const tokenPayload = {
      client_id: safeClientId,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    };

    if (safeClientSecret) {
      tokenPayload.client_secret = safeClientSecret;
    }

    const token = await postForm("https://oauth2.googleapis.com/token", tokenPayload);

    return { ok: true, ...token };
  } catch (err) {
    try {
      if (server) server.close();
    } catch {}
    return { ok: false, error: err?.message || "Google 로그인 실패" };
  }
}

async function getActiveProgramDetail() {
  try {
    const mod = await import("active-win");
    const activeWin = mod.default || mod.activeWindow || mod;
    const result = await activeWin();

    const processName = String(result?.owner?.name || "").trim();
    const title = String(result?.title || "").trim();

    return {
      processName,
      title,
      label: [processName, title].filter(Boolean).join(" "),
    };
  } catch {
    return { processName: "", title: "", label: "" };
  }
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
ipcMain.handle("xl:get-active-program-detail", async () => getActiveProgramDetail());
ipcMain.handle("xl:capture-active-program", async (_event, durationMs) => captureActiveProgram(durationMs));
ipcMain.handle("xl:get-running-programs", async () => getRunningPrograms());
ipcMain.handle("xl:google-auth", async (_event, payload) => startGoogleDesktopOAuth(payload || {}));

ipcMain.handle("xl:load-state", async () => loadStateFromFile());

ipcMain.handle("xl:save-state", async (_event, data) => saveStateToFile(data));
ipcMain.handle("xl:create-backup", async (_event, reason) => createStateBackup(reason));
ipcMain.handle("xl:list-backups", async () => listStateBackups());
ipcMain.handle("xl:restore-backup", async (_event, fileName) => restoreStateBackup(fileName));

ipcMain.handle("save-calendar-state", async (_event, data) => saveStateToFile(data));

ipcMain.handle("load-calendar-state", async () => loadStateFromFile());


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
