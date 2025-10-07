const { ipcRenderer } = require('electron');

// --- Konfigürasyon ---
const API_BASE_URL = 'https://sorukirp.sorucoz.tv/'; 
// ---

// HTML Elemanları
const bookListContainer = document.getElementById('book-list');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const questionInfo = document.getElementById('question-info');
const originalImage = document.getElementById('original-image');
const processedImage = document.getElementById('processed-image');
const filePathElement = document.getElementById('file-path');
const reportErrorBtn = document.getElementById('report-error-btn');
const confirmationModal = document.getElementById('confirmation-modal');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const notificationContainer = document.getElementById('notification-container');

// Durum Değişkenleri
let allKitapIds = [];
let selectedKitapId = null; // Seçili kitap ID'si
let currentQuestionIndex = 0;
let totalQuestions = 0;
let currentBeforePath = null; // Mevcut orijinal resmin path'i
let currentAfterPath = null; // Mevcut işlenmiş resmin path'i

// === IPC DİNLEYİCİSİ ===

// main.js'den gelen ilk veriyi (kitap ID'leri) al
ipcRenderer.on('init-data', (event, kitapIds) => {
    allKitapIds = kitapIds;
    renderBookList(kitapIds);
    // Pencere açıldığında ilk kitabı seç ve otomatik olarak ilk soruyu getir
    if (kitapIds.length > 0) {
        selectedKitapId = kitapIds[0]; // İlk kitabı seç
        fetchQuestion(0);
    }
});

// === OLAY DİNLEYİCİLERİ ===

prevBtn.addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
        fetchQuestion(currentQuestionIndex - 1);
    }
});

nextBtn.addEventListener('click', () => {
    if (currentQuestionIndex < totalQuestions - 1) {
        fetchQuestion(currentQuestionIndex + 1);
    }
});

// Hata bildir butonu
reportErrorBtn.addEventListener('click', () => {
    openModal();
});

// Modal olay dinleyicileri
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalConfirm.addEventListener('click', () => {
    reportError();
    closeModal();
});

// Modal dışına tıklandığında kapat
confirmationModal.addEventListener('click', (e) => {
    if (e.target === confirmationModal) {
        closeModal();
    }
});

// Klavye tuşları ile navigasyon
document.addEventListener('keydown', (e) => {
    // Modal açıkken klavye navigasyonunu devre dışı bırak
    if (confirmationModal.style.display === 'block') {
        return;
    }
    
    // Sol ok tuşu - önceki soru
    if (e.key === 'ArrowLeft' && !prevBtn.disabled) {
        e.preventDefault();
        fetchQuestion(currentQuestionIndex - 1);
    }
    
    // Sağ ok tuşu - sonraki soru
    if (e.key === 'ArrowRight' && !nextBtn.disabled) {
        e.preventDefault();
        fetchQuestion(currentQuestionIndex + 1);
    }
});

// Dosya path'ine tıklandığında Windows Explorer'da klasörü aç
filePathElement.addEventListener('click', () => {
    const pathText = filePathElement.textContent;
    if (pathText && pathText !== 'Path bulunamadı' && pathText !== '-') {
        // Electron'da shell.openPath kullanarak Windows Explorer'da klasörü aç
        ipcRenderer.invoke('open-folder', pathText).catch(error => {
            console.error('Klasör açılırken hata:', error);
            showNotification('Klasör açılırken bir hata oluştu: ' + error.message, 'error');
        });
    }
});

// === FONKSİYONLAR ===

// Kullanıcı dostu hata mesajı oluşturma fonksiyonu
function getUserFriendlyErrorMessage(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('failed to fetch') || message.includes('network error') || message.includes('fetch')) {
        return 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin veya daha sonra tekrar deneyin.';
    }
    
    if (message.includes('timeout') || message.includes('timed out')) {
        return 'İşlem zaman aşımına uğradı. Sunucu yanıt vermiyor, lütfen tekrar deneyin.';
    }
    
    if (message.includes('404') || message.includes('not found')) {
        return 'İstenen kaynak bulunamadı. API adresi değişmiş olabilir.';
    }
    
    if (message.includes('500') || message.includes('internal server error')) {
        return 'Sunucuda bir hata oluştu. Lütfen sistem yöneticisine başvurun.';
    }
    
    if (message.includes('403') || message.includes('forbidden')) {
        return 'Bu işlem için yetkiniz bulunmuyor.';
    }
    
    if (message.includes('401') || message.includes('unauthorized')) {
        return 'Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.';
    }
    
    // Eğer yukarıdaki durumlardan hiçbiri değilse, orijinal mesajı döndür
    return error.message;
}

// Notification gösterme fonksiyonu
function showNotification(message, type = 'success', duration = 4000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${icons[type] || icons.info}</span>
            <span class="notification-text">${message}</span>
        </div>
        <button class="notification-close" onclick="closeNotification(this)">&times;</button>
    `;
    
    notificationContainer.appendChild(notification);
    
    // Otomatik kapanma
    if (duration > 0) {
        setTimeout(() => {
            closeNotification(notification.querySelector('.notification-close'));
        }, duration);
    }
}

// Notification kapatma fonksiyonu
function closeNotification(closeBtn) {
    const notification = closeBtn.closest('.notification');
    if (notification) {
        notification.classList.add('slide-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
}

// Linux/network path'ini Windows UNC path'ine çevirir
function convertToWindowsPath(linuxPath) {
    if (!linuxPath) return '';
    
    // //bcs01.impark.local/Storage2/... formatını \\bcs01.impark.local\Storage2\... formatına çevir
    let windowsPath = linuxPath.replace(/\//g, '\\');
    
    // Eğer \\ ile başlamıyorsa, başına \\ ekle (UNC path için)
    if (!windowsPath.startsWith('\\\\')) {
        windowsPath = '\\' + windowsPath;
    }
    
    return windowsPath;
}

// Dosya path'inden klasör path'ini çıkarır
function getDirectoryPath(filePath) {
    if (!filePath) return '';
    
    const lastSlashIndex = filePath.lastIndexOf('\\');
    if (lastSlashIndex === -1) return filePath;
    
    return filePath.substring(0, lastSlashIndex);
}

// Soldaki kitap listesini HTML olarak oluşturur
function renderBookList(kitapIds) {
    bookListContainer.innerHTML = ''; // Listeyi temizle
    kitapIds.forEach(id => {
        const item = document.createElement('div');
        item.className = 'book-item';
        item.textContent = `Kitap ID: ${id}`;
        item.dataset.kitapId = id; // Kitap ID'sini data attribute olarak sakla
        
        // İlk kitap varsayılan olarak seçili
        if (id === selectedKitapId) {
            item.classList.add('selected');
        }
        
        // Kitaba tıklandığında, o kitabı seç ve sorularını baştan göster
        item.addEventListener('click', () => {
            // Önce tüm kitaplardan seçimi kaldır
            document.querySelectorAll('.book-item').forEach(book => {
                book.classList.remove('selected');
            });
            
            // Tıklanan kitabı seç
            item.classList.add('selected');
            selectedKitapId = id;
            
            // O kitabın ilk sorusunu getir
            fetchQuestion(0); 
        });
        bookListContainer.appendChild(item);
    });
}

// Belirli bir index'teki sorunun görsellerini API'den çeker
async function fetchQuestion(index) {
    // Seçili kitap yoksa işlemi durdur
    if (!selectedKitapId) {
        questionInfo.textContent = 'Lütfen bir kitap seçin';
        return;
    }
    
    // Sadece seçili kitabın ID'sini gönder
    const url = `${API_BASE_URL}/deep_cut/preview?kitapIds=${selectedKitapId}&index=${index}`;

    // Yükleniyor durumunu ayarla
    questionInfo.textContent = 'Yükleniyor...';
    originalImage.src = '';
    processedImage.src = '';
    prevBtn.disabled = true;
    nextBtn.disabled = true;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok && data.status === 'ok') {
            updateUI(data);
        } else {
            const errorMsg = data.message || 'Soru verisi alınamadı.';
            showNotification(errorMsg, 'error');
            throw new Error(errorMsg);
        }
    } catch (error) {
        const friendlyErrorMsg = getUserFriendlyErrorMessage(error);
        const errorMsg = `Hata: ${friendlyErrorMsg}`;
        questionInfo.textContent = errorMsg;
        showNotification(friendlyErrorMsg, 'error');
    }
}

function updateUI(data) {
    // Gelen base64 verisinin başına gerekli ön eki ekliyoruz
    originalImage.src = `data:image/png;base64,${data.before_image}`;
    processedImage.src = `data:image/png;base64,${data.after_image}`;

    currentQuestionIndex = data.current_index;
    totalQuestions = data.total_count;
    
    // Before ve after path'leri sakla (hata bildirimi için)
    currentBeforePath = data.metadata.original_path1;
    currentAfterPath = data.metadata.processed_path1;

    // Dosya path'ini Windows formatında göster
    const windowsPath = convertToWindowsPath(data.metadata.processed_path1);
    const directoryPath = getDirectoryPath(windowsPath);
    
    if (directoryPath) {
        filePathElement.textContent = directoryPath;
        filePathElement.style.cursor = 'pointer';
        filePathElement.title = 'Klasöre gitmek için tıklayın: ' + directoryPath;
    } else {
        filePathElement.textContent = 'Path bulunamadı';
        filePathElement.style.cursor = 'default';
        filePathElement.title = '';
    }

    questionInfo.textContent = `Soru: ${currentQuestionIndex + 1} / ${totalQuestions} (Kitap ID: ${data.metadata.kitap_id})`;

    prevBtn.disabled = !data.has_previous;
    nextBtn.disabled = !data.has_next;
    
    // Hata bildir butonunu duruma göre ayarla
    if (data.is_marked_as_faulty) {
        // Daha önce hatalı olarak işaretlenmiş
        reportErrorBtn.disabled = true;
        reportErrorBtn.textContent = '✓ Zaten Bildirilmiş';
        reportErrorBtn.classList.add('reported');
        reportErrorBtn.style.removeProperty('background-color'); // Inline style'ı kaldır
    } else {
        // Henüz hata bildirilmemiş
        reportErrorBtn.disabled = false;
        reportErrorBtn.textContent = '⚠️ Hata Bildir';
        reportErrorBtn.classList.remove('reported');
        reportErrorBtn.style.removeProperty('background-color'); // Inline style'ı kaldır
    }
}

// === MODAL FONKSİYONLARI ===

function openModal() {
    confirmationModal.style.display = 'block';
}

function closeModal() {
    confirmationModal.style.display = 'none';
}

// === HATA BİLDİRİMİ FONKSİYONU ===

async function reportError() {
    if (!currentBeforePath || !currentAfterPath) {
        showNotification('Hata: Resim bilgileri bulunamadı.', 'error');
        return;
    }

    const url = `${API_BASE_URL}/deep_cut/hatali_soru`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                before_path: currentBeforePath,
                after_path: currentAfterPath
            })
        });

        const data = await response.json();

        if (response.ok && data.status === 'ok') {
            showNotification('Hata bildirimi başarıyla gönderildi.', 'success');
            // Butonu deaktif et (tekrar bildirim yapılmasın)
            reportErrorBtn.disabled = true;
            reportErrorBtn.textContent = '✓ Bildirildi';
            reportErrorBtn.classList.add('reported');
            reportErrorBtn.style.removeProperty('background-color');
        } else {
            throw new Error(data.message || 'Hata bildirimi gönderilemedi.');
        }
    } catch (error) {
        const friendlyErrorMsg = getUserFriendlyErrorMessage(error);
        showNotification(`Hata bildirimi sırasında bir sorun oluştu: ${friendlyErrorMsg}`, 'error');
    }
}