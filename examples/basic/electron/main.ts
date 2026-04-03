import { BrowserWindow, app } from 'electron';
import {
  createPortBroker,
  createPortHandler,
} from 'electron-messageport-trpc/main';
import path from 'node:path';
import { appRouter } from './router';

const broker = createPortBroker();

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  let handler: ReturnType<typeof createPortHandler> | null = null;

  win.webContents.on('did-finish-load', () => {
    handler?.destroy();

    const { serverPort } = broker.createRendererPort(win.webContents);
    handler = createPortHandler({
      port: serverPort,
      router: appRouter,
    });
  });

  win.on('closed', () => handler?.destroy());

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
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
