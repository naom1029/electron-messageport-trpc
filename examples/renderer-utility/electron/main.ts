import path from 'node:path';
import { app, BrowserWindow, utilityProcess } from 'electron';
import { createPortBroker } from 'electron-messageport-trpc/main';

const broker = createPortBroker();

async function waitForUtilityReady(
  child: Electron.UtilityProcess,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handleMessage = (message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'ready'
      ) {
        child.off('message', handleMessage);
        child.off('exit', handleExit);
        resolve();
      }
    };

    const handleExit = (code: number) => {
      child.off('message', handleMessage);
      child.off('exit', handleExit);
      reject(new Error(`Utility process exited before ready: ${code}`));
    };

    child.on('message', handleMessage);
    child.on('exit', handleExit);
  });
}

async function createWindow() {
  const child = utilityProcess.fork(path.join(__dirname, 'worker.js'));
  await waitForUtilityReady(child);
  const win = new BrowserWindow({
    width: 860,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('did-finish-load', () => {
    const { serverPort } = broker.createRendererPort(win.webContents);
    child.postMessage({ type: 'connect' }, [serverPort]);
  });

  win.on('closed', () => {
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
