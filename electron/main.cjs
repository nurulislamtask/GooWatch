// GooWatch Desktop — Electron main process.
// Starts the original GooWatch backend locally and opens the original UI in a window.
const { app, BrowserWindow, Menu, shell, dialog, Notification, ipcMain } = require('electron');
const path = require('path');

// Linux: AppImage / newer Ubuntu block Chromium's sandbox helper, which would stop the app from opening at all.
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');
const fs = require('fs');

// A fixed port keeps the app's saved data (localStorage: servers, settings, history)
// on the same origin every launch. Falls back to a random free port if it is busy.
const PREFERRED_PORT = 38417;

// ffmpeg / ffprobe bundled with the installer (resources/bin) -> put them on PATH
// BEFORE the backend loads, because it detects them at startup.
const binDir = app.isPackaged
  ? path.join(process.resourcesPath, 'bin')
  : path.join(__dirname, '..', 'build-bin');
if (fs.existsSync(binDir)) {
  process.env.PATH = binDir + path.delimiter + (process.env.PATH || '');
}
process.env.NODE_ENV = 'production';
process.env.CINEFTP_DIRECT_LAN = '1'; // talk to 172.16.x.x DhakaFlix servers directly

// Optional: GEMINI_API_KEY for the AI assistant. Put it in
// %APPDATA%\GooWatch\.env as:  GEMINI_API_KEY=your_key
try {
  const envFile = path.join(app.getPath('userData'), '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;

// ---- Install links from websites: stremio://…  nuvio://…  goowatch://…  -> open GooWatch + "Install?" popup ----
const LINK_SCHEMES = ['goowatch', 'stremio', 'nuvio'];
const findLink = (argv) => (argv || []).find((a) => typeof a === 'string' && LINK_SCHEMES.some((s) => a.toLowerCase().startsWith(s + '://')));
let pendingLink = findLink(process.argv);
function deliverLink(url) {
  if (!url) return;
  if (!mainWindow || mainWindow.webContents.isLoading()) {
    pendingLink = url;
    return;
  }
  const j = JSON.stringify(url);
  mainWindow.webContents
    .executeJavaScript(`window.__gwPendingLink=${j};window.dispatchEvent(new CustomEvent('goowatch-link',{detail:${j}}))`)
    .catch(() => {});
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}
try {
  for (const s of LINK_SCHEMES) {
    if (process.defaultApp) {
      if (process.argv.length >= 2) app.setAsDefaultProtocolClient(s, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(s);
    }
  }
} catch {}
app.on('open-url', (e, url) => {
  e.preventDefault();
  deliverLink(url);
});

async function boot() {
  const distPath = path.join(__dirname, '..', 'dist');
  const { startServer } = require('./server.cjs');

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // The same port every time keeps the saved data (localStorage belongs to the address). After an update the old
  // process can still hold the port for a moment, so try a few times before using a random one.
  let port;
  for (let i = 0; i < 6 && !port; i++) {
    try {
      port = await startServer(distPath, PREFERRED_PORT);
    } catch {
      await wait(700);
    }
  }
  if (!port) port = await startServer(distPath, 0);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#090A0F',
    title: 'GooWatch',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // F11 = fullscreen, Ctrl+R = reload, Ctrl+Shift+I = devtools
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') mainWindow.setFullScreen(!mainWindow.isFullScreen());
    if (input.control && !input.shift && input.key.toLowerCase() === 'r') mainWindow.webContents.reload();
    if (input.control && input.shift && input.key.toLowerCase() === 'i') mainWindow.webContents.toggleDevTools();
  });

  // Links to other websites open in the normal browser, not inside the app.
  const appOrigin = `http://127.0.0.1:${port}`;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(appOrigin)) shell.openExternal(url);
    return { action: url.startsWith(appOrigin) ? 'allow' : 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(appOrigin)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // ERR_FAILED (-2) can happen once while the local server is still waking up: try again a few times
  let loadErr;
  for (let i = 0; i < 5; i++) {
    try {
      await mainWindow.loadURL(appOrigin);
      loadErr = null;
      break;
    } catch (e) {
      loadErr = e;
      await wait(600 * (i + 1));
    }
  }
  if (loadErr) throw loadErr;
  mainWindow.on('closed', () => (mainWindow = null));
  if (pendingLink) {
    const l = pendingLink;
    pendingLink = null;
    setTimeout(() => deliverLink(l), 1200);
  }
  setupAutoUpdate();
}


// ---------------------------------------------------------------------------
// Auto update (GitHub Releases). Checks shortly after start and every 4 hours.
// New version found -> desktop notification + "Update now / Later" box.
// "Update now" downloads it (taskbar progress), installs silently and restarts the app.
// ---------------------------------------------------------------------------
function setupAutoUpdate() {
  if (!app.isPackaged) return; // only the installed app updates itself
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  app.setAppUserModelId('com.goowatch.desktop');
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // The page shows a blocking "Updating GooWatch" screen (no way to skip it): the download starts by itself.
  let ustate = { state: 'none', version: '', percent: 0, message: '' };
  const push = () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('gw-update', ustate);
    } catch {}
  };
  const startDownload = () => {
    ustate = { ...ustate, state: 'downloading', percent: 0, message: '' };
    push();
    autoUpdater.downloadUpdate().catch((e) => {
      ustate = { ...ustate, state: 'error', message: String((e && e.message) || e) };
      push();
    });
  };
  ipcMain.on('gw-update-hello', push);
  ipcMain.on('gw-update-start', () => {
    if (ustate.state === 'available' || ustate.state === 'error') startDownload();
  });
  autoUpdater.on('update-available', (info) => {
    try {
      new Notification({ title: 'GooWatch is updating', body: `Version ${info.version} is downloading.` }).show();
    } catch {}
    ustate = { state: 'available', version: info.version, percent: 0, message: '' };
    push();
    startDownload();
  });
  autoUpdater.on('download-progress', (p) => {
    const pc = Math.max(0, Math.min(100, p.percent || 0));
    if (mainWindow) mainWindow.setProgressBar(pc / 100);
    ustate = { ...ustate, state: 'downloading', percent: pc };
    push();
  });
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.setProgressBar(-1);
    ustate = { ...ustate, state: 'ready', percent: 100 };
    push();
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 600); // silent install, then reopen GooWatch
  });
  autoUpdater.on('error', (e) => {
    if (mainWindow) mainWindow.setProgressBar(-1);
    if (ustate.state === 'downloading' || ustate.state === 'available') {
      ustate = { ...ustate, state: 'error', message: String((e && e.message) || e || 'Download failed') };
      push();
    }
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

app.on('second-instance', (_e, argv) => {
  deliverLink(findLink(argv));
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  boot().catch((err) => {
    dialog.showErrorBox('GooWatch failed to start', String((err && err.stack) || err));
    app.quit();
  });
});

app.on('window-all-closed', () => app.quit());
