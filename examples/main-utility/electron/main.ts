import path from 'node:path';
import { app, BrowserWindow, ipcMain, utilityProcess } from 'electron';
import { createElectronTRPCUtilityClient } from 'electron-messageport-trpc/main';
import { electronTRPC } from './trpc';

function createUtilityClient() {
  const child = utilityProcess.fork(path.join(__dirname, 'worker.js'));

  // The library waits for the utility's 'ready' signal before posting connect
  // and auto-closes the kept port when the utility exits, so no hand-written
  // ready handshake is needed here.
  const { client, destroy } = createElectronTRPCUtilityClient({
    channel: electronTRPC.worker,
    utility: child,
  });

  return { child, client, destroy };
}

async function createWindow() {
  const utility = createUtilityClient();
  const win = new BrowserWindow({
    width: 860,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const heartbeat = utility.client.heartbeats.subscribe(undefined, {
    onData(data) {
      for (const currentWindow of BrowserWindow.getAllWindows()) {
        currentWindow.webContents.send('main-utility:heartbeat', data);
      }
    },
    onError(error) {
      console.error('main-utility heartbeat failed', error);
    },
  });

  ipcMain.handle('main-utility:get-greeting', async (_event, name: string) => {
    return utility.client.greet.query({ name });
  });

  ipcMain.handle(
    'main-utility:generate-report',
    async (_event, topic: string) => {
      return utility.client.generateReport.mutate({ topic });
    },
  );

  win.on('closed', () => {
    heartbeat.unsubscribe();
    ipcMain.removeHandler('main-utility:get-greeting');
    ipcMain.removeHandler('main-utility:generate-report');
    utility.destroy();
    utility.child.kill();
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
