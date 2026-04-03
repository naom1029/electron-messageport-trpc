import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mainUtilityDemo', {
  getGreeting(name: string) {
    return ipcRenderer.invoke('main-utility:get-greeting', name);
  },
  generateReport(topic: string) {
    return ipcRenderer.invoke('main-utility:generate-report', topic);
  },
  onHeartbeat(listener: (payload: { sequence: number; at: string }) => void) {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      payload: { sequence: number; at: string },
    ) => {
      listener(payload);
    };

    ipcRenderer.on('main-utility:heartbeat', wrapped);

    return () => {
      ipcRenderer.off('main-utility:heartbeat', wrapped);
    };
  },
});
