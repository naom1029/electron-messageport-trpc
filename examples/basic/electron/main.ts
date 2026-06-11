import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { createElectronTRPCMain } from 'electron-messageport-trpc/main';
import { appRouter } from './router';
import { electronTRPC } from './trpc';

async function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  createElectronTRPCMain({
    channels: electronTRPC,
    routers: {
      main: appRouter,
    },
    windows: [win],
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
