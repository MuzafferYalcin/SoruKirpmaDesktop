const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs'); // Node.js'in dosya sistemi modülünü dahil et

// Ana pencereye diğer fonksiyonlardan erişebilmek için referansını dışarıda tutuyoruz.
let mainWindow;

// Ana uygulama penceresini oluşturan fonksiyon
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 720,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: "Soru Temizleme Desktop App"
  });

  // İsteğe bağlı: Üstteki "File, Edit" menüsünü gizler
  // mainWindow.setMenuBarVisibility(false); 
  
  mainWindow.loadFile('index.html');
}

// Önizleme penceresini oluşturan fonksiyon
function createPreviewWindow(kitapIds) {
  const previewWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: "Önizleme - Kitap ve Soru Görüntüleme"
  });

  previewWindow.loadFile('preview.html');

  previewWindow.webContents.on('did-finish-load', () => {
    previewWindow.webContents.send('init-data', kitapIds);
  });
}

// Kitap Seçim penceresini oluşturan fonksiyon (YENİ)
function createSelectorWindow(filters) {
    const selectorWindow = new BrowserWindow({
        width: 400,
        height: 500,
        parent: mainWindow, // Ana pencereye bağlı olduğunu belirtir
        modal: true,       // Modal olarak açar (bu pencere kapanmadan ana pencereye tıklanamaz)
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        title: "Kitap Seç"
    });

    selectorWindow.loadFile('selector.html');
    // selectorWindow.setMenuBarVisibility(false);

    // Pencere hazır olunca, filtreleme verisini (üst kurum id, tarihler) gönder
    selectorWindow.webContents.on('did-finish-load', () => {
        selectorWindow.webContents.send('filters-data', filters);
    });
}


// --- UYGULAMA YAŞAM DÖNGÜSÜ ---

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});


// --- PENCERELER ARASI İLETİŞİM (IPC) ---

// Önizleme penceresini açma talebini dinle
ipcMain.on('open-preview-window', (event, kitapIds) => {
  createPreviewWindow(kitapIds);
});

// Log dosyasını kaydetme talebini dinle
ipcMain.on('save-log-file', (event, { filename, content }) => {
  const logsDir = path.join(app.getPath('userData'), 'logs');

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const filePath = path.join(logsDir, filename);

  fs.writeFile(filePath, content, (err) => {
    if (err) {
      console.error('Log dosyası kaydedilemedi:', err);
    } else {
      console.log('Log dosyası başarıyla kaydedildi:', filePath);
      event.reply('log-file-saved', filePath);
    }
  });
});

// Kitap seçim penceresini açma talebini dinle (YENİ)
ipcMain.on('open-selector-window', (event, filters) => {
    createSelectorWindow(filters);
});

// Kitap seçim penceresinden gelen sonucu dinle (YENİ)
ipcMain.on('selection-complete', (event, selectedIds) => {
    // Gelen sonucu ana pencerenin arayüzüne (renderer.js) geri gönder
    mainWindow.webContents.send('update-kitap-ids', selectedIds);
    
    // İşlem bitince seçim penceresini kapat
    const selectorWindow = BrowserWindow.fromWebContents(event.sender);
    if (selectorWindow) {
        selectorWindow.close();
    }
});