const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ==========================================
  // SSH & SFTP APIs
  // ==========================================
  ssh: {
    connect: (id, config) => ipcRenderer.invoke('ssh:connect', id, config),
    write: (id, data) => ipcRenderer.invoke('ssh:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke('ssh:resize', id, cols, rows),
    disconnect: (id) => ipcRenderer.invoke('ssh:disconnect', id),
    onData: (callback) => {
      const sub = (event, data) => callback(data);
      ipcRenderer.on('ssh:data', sub);
      return () => ipcRenderer.removeListener('ssh:data', sub);
    },
    onStatus: (callback) => {
      const sub = (event, data) => callback(data);
      ipcRenderer.on('ssh:status', sub);
      return () => ipcRenderer.removeListener('ssh:status', sub);
    },
    onError: (callback) => {
      const sub = (event, data) => callback(data);
      ipcRenderer.on('ssh:error', sub);
      return () => ipcRenderer.removeListener('ssh:error', sub);
    },
    onStats: (callback) => {
      const sub = (event, data) => callback(data);
      ipcRenderer.on('ssh:stats', sub);
      return () => ipcRenderer.removeListener('ssh:stats', sub);
    },
    notifyActivity: (id) => ipcRenderer.invoke('ssh:notify-activity', id),
    getDirSize: (id, path) => ipcRenderer.invoke('ssh:get-dir-size', id, path),
    getDirDetails: (id, path) => ipcRenderer.invoke('ssh:get-dir-details', id, path)
  },
  sftp: {
    list: (id, remotePath) => ipcRenderer.invoke('sftp:list', id, remotePath),
    mkdir: (id, remotePath) => ipcRenderer.invoke('sftp:mkdir', id, remotePath),
    deleteFile: (id, remotePath) => ipcRenderer.invoke('sftp:delete-file', id, remotePath),
    rmdir: (id, remotePath) => ipcRenderer.invoke('sftp:rmdir', id, remotePath),
    rename: (id, oldPath, newPath) => ipcRenderer.invoke('sftp:rename', id, oldPath, newPath),
    download: (id, remotePath, localPath, transferId) => ipcRenderer.invoke('sftp:download', id, remotePath, localPath, transferId),
    upload: (id, localPath, remotePath, transferId) => ipcRenderer.invoke('sftp:upload', id, localPath, remotePath, transferId),
    abortTransfers: (id, transferId) => ipcRenderer.invoke('sftp:abort-transfers', id, transferId),
    pauseTransfer: (id, transferId) => ipcRenderer.invoke('sftp:pause-transfer', id, transferId),
    resumeTransfer: (id, transferId) => ipcRenderer.invoke('sftp:resume-transfer', id, transferId),
    onProgress: (callback) => {
      const sub = (event, data) => callback(data);
      ipcRenderer.on('sftp:progress', sub);
      return () => ipcRenderer.removeListener('sftp:progress', sub);
    },
    onHomeDirectory: (callback) => {
      const sub = (event, data) => callback(data);
      ipcRenderer.on('sftp:home-directory', sub);
      return () => ipcRenderer.removeListener('sftp:home-directory', sub);
    }
  },
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:open-file', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:save-file', options)
  },
  localFs: {
    listDir: (dirPath) => ipcRenderer.invoke('local-fs:list', dirPath),
    getHomeDir: () => ipcRenderer.invoke('local-fs:get-home'),
    mkdir: (dirPath) => ipcRenderer.invoke('local-fs:mkdir', dirPath),
    deleteItem: (itemPath) => ipcRenderer.invoke('local-fs:delete', itemPath),
    rename: (oldPath, newPath) => ipcRenderer.invoke('local-fs:rename', oldPath, newPath),
    exists: (itemPath) => ipcRenderer.invoke('local-fs:exists', itemPath)
  },
  saveAppIcon: (dataUrl) => ipcRenderer.invoke('app:save-icon', dataUrl)
});
