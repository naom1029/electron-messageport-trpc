import path from 'node:path';
import { app, BrowserWindow, utilityProcess } from 'electron';
import { createElectronTRPCRendererUtilityBridge } from 'electron-messageport-trpc/main';
import { electronTRPC } from './trpc';

async function createWindow() {
  const child = utilityProcess.fork(path.join(__dirname, 'worker.js'));
  const win = new BrowserWindow({
    width: 860,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const bridge = createElectronTRPCRendererUtilityBridge({
    window: win,
    channel: electronTRPC.worker,
    utility: child,
  });

  win.on('closed', () => {
    bridge.destroy();
    child.kill();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
