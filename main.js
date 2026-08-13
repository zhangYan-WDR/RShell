const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sshManager = require('./ssh-manager');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1350,
    height: 850,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
    title: 'RShell',
    icon: path.join(__dirname, 'icon.png')
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    cleanupAll();
  });
}

function migrateUserData() {
  try {
    const fs = require('fs');
    const path = require('path');
    const newPath = app.getPath('userData');
    const markerFile = path.join(newPath, 'migration_done.txt');

    // 1. If marker file exists, we are done
    if (fs.existsSync(markerFile)) {
      return;
    }

    // 2. Write marker file first to guarantee we never run migration again even if it crashes/errors
    try {
      if (!fs.existsSync(newPath)) {
        fs.mkdirSync(newPath, { recursive: true });
      }
      fs.writeFileSync(markerFile, 'done', 'utf8');
    } catch (writeErr) {
      console.error('[Migration] Failed to write marker file:', writeErr);
    }

    // 3. Check if destination already has a Local Storage database
    const newLocalStorage = path.join(newPath, 'Local Storage');
    if (fs.existsSync(newLocalStorage)) {
      console.log('[Migration] Destination already has Local Storage data. Skipping migration.');
      return;
    }

    const appData = app.getPath('appData');
    const oldPaths = [
      path.join(appData, 'SSH终极终端'),
      path.join(appData, 'ssh-ultimate-terminal')
    ];

    for (const oldPath of oldPaths) {
      if (fs.existsSync(oldPath) && oldPath !== newPath) {
        const localStoragePath = path.join(oldPath, 'Local Storage');
        if (fs.existsSync(localStoragePath)) {
          console.log(`[Migration] Migrating config from ${oldPath} to ${newPath}...`);
          try {
            fs.cpSync(oldPath, newPath, {
              recursive: true,
              force: true, // Use force true since destination is verified to not have Local Storage yet
              filter: (src, dest) => {
                const base = path.basename(src);
                return !base.includes('Singleton') && !base.includes('lock') && !base.includes('Socket');
              }
            });
            console.log('[Migration] Config migration complete!');
          } catch (copyErr) {
            console.error('[Migration] Copy failed:', copyErr);
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error('[Migration] Error during migration:', err);
  }
}

function cleanupAll() {
  console.log('[System] Cleaning up SSH sessions...');
  try {
    sshManager.cleanupAll();
  } catch (e) {
    console.error('Cleanup error:', e);
  }
}

app.whenReady().then(() => {
  migrateUserData();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==========================================
// IPC HANDLERS: SSH & SFTP CLIENT
// ==========================================

ipcMain.handle('ssh:connect', async (event, id, config) => {
  try {
    const result = await sshManager.connect(id, config, mainWindow);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ssh:write', async (event, id, data) => {
  const success = sshManager.write(id, data);
  return { success };
});

ipcMain.handle('ssh:resize', async (event, id, cols, rows) => {
  const success = sshManager.resize(id, cols, rows);
  return { success };
});

ipcMain.handle('ssh:disconnect', async (event, id) => {
  const success = sshManager.disconnect(id);
  return { success };
});

ipcMain.handle('ssh:notify-activity', async (event, id) => {
  sshManager.notifyActivity(id);
  return { success: true };
});

ipcMain.handle('ssh:get-dir-size', async (event, id, path) => {
  try {
    const size = await sshManager.getDirSize(id, path);
    return { success: true, size };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ssh:get-dir-details', async (event, id, path) => {
  try {
    const details = await sshManager.getDirDetails(id, path);
    return { success: true, details };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Local Filesystem Handlers
ipcMain.handle('local-fs:list', async (event, dirPath) => {
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const details = [];
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      try {
        const stats = await fs.promises.stat(itemPath);
        details.push({
          name: item.name,
          isDirectory: item.isDirectory(),
          size: stats.size,
          mtime: stats.mtimeMs,
          permissions: stats.mode
        });
      } catch (err) {
        details.push({
          name: item.name,
          isDirectory: item.isDirectory(),
          size: 0,
          mtime: Date.now(),
          permissions: 0
        });
      }
    }
    return { success: true, items: details };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-fs:get-home', async () => {
  return os.homedir();
});

ipcMain.handle('local-fs:mkdir', async (event, dirPath) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-fs:delete', async (event, itemPath) => {
  try {
    await fs.promises.rm(itemPath, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-fs:rename', async (event, oldPath, newPath) => {
  try {
    await fs.promises.rename(oldPath, newPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-fs:exists', async (event, itemPath) => {
  return fs.existsSync(itemPath);
});

// SFTP Handlers
ipcMain.handle('sftp:list', async (event, id, remotePath) => {
  try {
    const list = await sshManager.list(id, remotePath);
    return { success: true, list };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:mkdir', async (event, id, remotePath) => {
  try {
    await sshManager.mkdir(id, remotePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:delete-file', async (event, id, remotePath) => {
  try {
    await sshManager.deleteFile(id, remotePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:rmdir', async (event, id, remotePath) => {
  try {
    await sshManager.rmdir(id, remotePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:rename', async (event, id, oldPath, newPath) => {
  try {
    await sshManager.rename(id, oldPath, newPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:download', async (event, id, remotePath, localPath, transferId) => {
  try {
    await sshManager.download(id, remotePath, localPath, transferId, (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('sftp:progress', {
          sessionId: id,
          transferId,
          type: 'download',
          remotePath,
          localPath,
          percent
        });
      }
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:upload', async (event, id, localPath, remotePath, transferId) => {
  try {
    await sshManager.upload(id, localPath, remotePath, transferId, (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('sftp:progress', {
          sessionId: id,
          transferId,
          type: 'upload',
          localPath,
          remotePath,
          percent
        });
      }
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:abort-transfers', async (event, id, transferId) => {
  try {
    sshManager.abortTransfers(id, transferId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:pause-transfer', async (event, id, transferId) => {
  try {
    const success = sshManager.pauseTransfer(transferId);
    return { success };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:resume-transfer', async (event, id, transferId) => {
  try {
    const success = sshManager.resumeTransfer(transferId);
    return { success };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Dialog wrappers
const { dialog } = require('electron');

ipcMain.handle('dialog:open-file', async (event, options) => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, options || {
    properties: ['openFile']
  });
  if (res.canceled) return null;
  return res.filePaths[0];
});

ipcMain.handle('dialog:save-file', async (event, options) => {
  if (!mainWindow) return null;
  const res = await dialog.showSaveDialog(mainWindow, options || {});
  if (res.canceled) return null;
  return res.filePath;
});

// App icon dynamic generation & macOS Dock integration
ipcMain.handle('app:save-icon', async (event, dataUrl) => {
  try {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    const iconPath = path.join(__dirname, 'icon.png');
    
    // Only write once or overwrite to ensure it's generated
    fs.writeFileSync(iconPath, base64Data, 'base64');
    
    if (process.platform === 'darwin') {
      const { nativeImage } = require('electron');
      const image = nativeImage.createFromPath(iconPath);
      app.dock.setIcon(image);
    }
    return { success: true };
  } catch (e) {
    console.error('[Icon] Failed to save app icon:', e);
    return { success: false, error: e.message };
  }
});
