const { app, BrowserWindow, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
let mainWindow

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true
    }
  })



  mainWindow.loadFile('src/index.html');
  // mainWindow.webContents.openDevTools()

  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

app.on('ready', function() {
  createWindow();
})

app.on('second-instance', (e, c, w) => {
  app.quit();
});

app.on('window-all-closed', function () {
  app.quit()
})
