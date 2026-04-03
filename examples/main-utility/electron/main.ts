import path from 'node:path';
import { createTRPCClient } from '@trpc/client';
import {
  app,
  BrowserWindow,
  ipcMain,
  MessageChannelMain,
  utilityProcess,
} from 'electron';
import { mainPortLink } from 'electron-messageport-trpc/main';
import type { UtilityRouter } from '../utility/router';

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

async function createUtilityClient() {
  const child = utilityProcess.fork(path.join(__dirname, 'worker.js'));
  const { port1, port2 } = new MessageChannelMain();

  await waitForUtilityReady(child);
  child.postMessage({ type: 'connect' }, [port1]);

  const client = createTRPCClient<UtilityRouter>({
    links: [mainPortLink({ port: port2 })],
  });

  return { child, client, port: port2 };
}

async function createWindow() {
  const utility = await createUtilityClient();
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
    utility.port.close();
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
