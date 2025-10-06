const { ipcRenderer } = require('electron');
const flatpickr = require('flatpickr');
const { Turkish } = require("flatpickr/dist/l10n/tr.js");

// --- Konfigürasyon ---
const API_BASE_URL = 'http://bcaicpudev.impark.local:1071';
// ---

// HTML Elemanları
const randomBtn = document.getElementById('btn-random');
const deepCutBtn = document.getElementById('btn-deepcut');
const previewBtn = document.getElementById('btn-preview');
const bookIdsInput = document.getElementById('book-ids');
const imageCountInput = document.getElementById('image-count');
const resultsArea = document.getElementById('results');
const loaderOverlay = document.getElementById('loader-overlay');
const parentIdsInput = document.getElementById('parent-ids');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const getBookIdsBtn = document.getElementById('btn-get-book-ids');

const actionButtons = [randomBtn, deepCutBtn];
let processedKitapIds = [];

// === OLAY DİNLEYİCİLERİ ===

deepCutBtn.addEventListener('click', () => handleApiRequest('deepcut'));
randomBtn.addEventListener('click', () => handleApiRequest('random'));

// !!!!!!!!!!! DEĞİŞİKLİK BURADA !!!!!!!!!!!
previewBtn.addEventListener('click', () => {
    // Artık `processedKitapIds` değişkenine bakmak yerine, doğrudan input alanını okuyor.
    const kitapIdsStr = bookIdsInput.value.trim();
    
    if (kitapIdsStr) {
        const kitapIds = kitapIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        
        if (kitapIds.length > 0) {
            // Input'ta geçerli ID varsa, pencereyi bu ID'lerle aç.
            ipcRenderer.send('open-preview-window', kitapIds);
        } else {
            resultsArea.value = "Hata: Girdiğiniz Kitap ID'leri geçerli bir formatta değil.";
        }
    } else {
        // Input boşsa kullanıcıyı uyar.
        resultsArea.value = "Önizleme yapmak için lütfen Kitap ID'leri alanını doldurun.";
    }
});
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

getBookIdsBtn.addEventListener('click', () => {
    const ustKurumIdsStr = parentIdsInput.value.trim();
    if (!ustKurumIdsStr) {
        resultsArea.value = "Lütfen önce Üst Kurum ID'si girin.";
        return;
    }
    const ustKurumIds = ustKurumIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    const startDate = startDateInput.value || null;
    const endDate = endDateInput.value || null;
    ipcRenderer.send('open-selector-window', { ustKurumIds, startDate, endDate });
});

// === ANA İŞLEM FONKSİYONU ===
async function handleApiRequest(type) {
    const kitapIdsStr = bookIdsInput.value.trim();
    const ustKurumIdsStr = parentIdsInput.value.trim();
    const startDate = startDateInput.value || null;
    const endDate = endDateInput.value || null;

    if (kitapIdsStr && ustKurumIdsStr) {
        resultsArea.value = 'Hata: Lütfen sadece Kitap ID\'leri veya sadece Üst Kurum ID\'leri girin. İkisi aynı anda kullanılamaz.';
        return;
    }

    let url, body, endpointType;

    if (ustKurumIdsStr) {
        const ustKurumIds = ustKurumIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        if (ustKurumIds.length === 0) {
            resultsArea.value = 'Hata: Geçerli Üst Kurum ID\'leri girin.';
            return;
        }
        endpointType = 'kurum';
        url = `${API_BASE_URL}/deepCutByKurums`;
        body = JSON.stringify({ ustKurumIds, startDate, endDate });
    } else if (kitapIdsStr) {
        const kitapIds = kitapIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        if (kitapIds.length === 0) {
            resultsArea.value = 'Hata: Geçerli Kitap ID\'leri girin.';
            return;
        }
        endpointType = 'kitap';
        if (type === 'random') {
            const countPerKitap = parseInt(imageCountInput.value);
            url = `${API_BASE_URL}/deep_cut/random`;
            body = JSON.stringify({ kitapIds, countPerKitap });
        } else {
            url = `${API_BASE_URL}/deep_cut`;
            body = JSON.stringify({ kitapIds });
        }
    } else {
        resultsArea.value = 'Hata: Lütfen işlem yapmak için Kitap ID\'leri veya Üst Kurum ID\'leri girin.';
        return;
    }

    setUiLockState(true);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });
        const data = await response.json();
        
        let logContent = '';
        if (response.ok) {
            if (data.logs && Array.isArray(data.logs)) {
                logContent += "--- İŞLEM LOGLARI ---\n";
                data.logs.forEach(log => {
                    logContent += `[${formatDate(log.timestamp)}] [${log.level}] ${log.message}\n`;
                });
            }
            if (data.summary) {
                logContent += "\n--- İŞLEM ÖZETİ ---\n";
                logContent += JSON.stringify(data.summary, null, 2);
            }
            resultsArea.value = logContent;
            
            if(data.status === 'ok') {
                if(endpointType === 'kitap') {
                    processedKitapIds = JSON.parse(body).kitapIds;
                } else {
                    processedKitapIds = []; 
                    logContent += "\n\nNot: Kurum bazlı işlemlerde önizleme özelliği şu an için desteklenmemektedir.";
                }
            }
            const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
            const filename = `log-${timestamp}.txt`;
            ipcRenderer.send('save-log-file', { filename, content: logContent });
        } else {
            throw new Error(data.message || 'API\'den hatalı yanıt geldi.');
        }
    } catch (error) {
        resultsArea.value = `Bir hata oluştu: ${error.message}`;
    } finally {
        setUiLockState(false);
    }
}

// === PENCERELER ARASI İLETİŞİM CEVAPLARI ===
ipcRenderer.on('log-file-saved', (event, filePath) => {
    resultsArea.value += `\n\n--- 💾 Loglar başarıyla kaydedildi ---\nDosya Yolu: ${filePath}`;
    resultsArea.scrollTop = resultsArea.scrollHeight;
});

ipcRenderer.on('update-kitap-ids', (event, selectedIds) => {
    bookIdsInput.value = selectedIds.join(', ');
    parentIdsInput.value = '';
    resultsArea.value = `${selectedIds.length} adet kitap ID'si seçildi ve alana yazıldı.`;
});

// === YARDIMCI FONKSİYONLAR ===
function setUiLockState(isLocked) {
    if (isLocked) {
        actionButtons.forEach(btn => btn.disabled = true);
        bookIdsInput.disabled = true;
        parentIdsInput.disabled = true;
        imageCountInput.disabled = true;
        startDateInput.disabled = true;
        endDateInput.disabled = true;
        loaderOverlay.classList.remove('hidden');
        resultsArea.value = "İşlem başlatıldı. Bu işlem kitap/kurum sayısına göre uzun sürebilir. Lütfen bekleyin ve uygulamayı kapatmayın...";
    } else {
        actionButtons.forEach(btn => btn.disabled = false);
        bookIdsInput.disabled = false;
        parentIdsInput.disabled = false;
        imageCountInput.disabled = false;
        startDateInput.disabled = false;
        endDateInput.disabled = false;
        loaderOverlay.classList.add('hidden');
    }
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('tr-TR');
}

// === BAŞLANGIÇ AYARLARI ===
document.addEventListener('DOMContentLoaded', () => {
    randomBtn.disabled = false;
    
    const config = {
        locale: Turkish,
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d.m.Y"
    };
    
    flatpickr(startDateInput, config);
    flatpickr(endDateInput, config);
});