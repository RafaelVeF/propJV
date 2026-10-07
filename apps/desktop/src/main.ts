import { app, BrowserWindow } from 'electron';
import path from 'path';
import { GAME_NAME } from '@prop-hunt/shared';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    title: GAME_NAME,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // In development, load client dev server or static file
  win.loadURL('http://localhost:5173');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
