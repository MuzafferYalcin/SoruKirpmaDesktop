const { ipcRenderer } = require('electron');

// --- Konfigürasyon ---
const API_BASE_URL = 'http://bcaicpudev.impark.local:1071'; // API adresini kendi adresinle değiştir
// ---

const bookListContainer = document.getElementById('book-list-container');
const selectAllCheckbox = document.getElementById('select-all');
const confirmBtn = document.getElementById('confirm-selection');

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
function showNotification(message, type = 'error', duration = 5000) {
    // Eğer notification container yoksa oluştur
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
        `;
        document.body.appendChild(container);
    }

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
            <span class="notification-icon">${icons[type] || icons.error}</span>
            <span class="notification-text">${message}</span>
        </div>
        <button class="notification-close" onclick="closeNotification(this)">&times;</button>
    `;
    
    // Notification stilleri
    notification.style.cssText = `
        background: ${type === 'success' ? '#4CAF50' : type === 'warning' ? '#FF9800' : '#f44336'};
        color: white;
        padding: 12px 16px;
        margin-bottom: 10px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        justify-content: space-between;
        animation: slideIn 0.3s ease-out;
        font-family: Arial, sans-serif;
        font-size: 14px;
    `;
    
    container.appendChild(notification);
    
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
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
}

// 1. Adım: Ana süreçten gelen filtreleri dinle
ipcRenderer.on('filters-data', (event, filters) => {
    fetchBookIds(filters);
});

// 2. Adım: Filtrelere göre API'den kitap ID'lerini çek
async function fetchBookIds(filters) {
    try {
        // API endpoint'ini ve query parametrelerini oluştur
        const params = new URLSearchParams();
        params.append('ustKurumIds', filters.ustKurumIds.join(','));
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);

        // BURASI ÇOK ÖNEMLİ: API ekibinin bu endpoint'i oluşturması gerekiyor!
        const response = await fetch(`${API_BASE_URL}/api/kitaplarByKurum?${params.toString()}`);
        
        if (!response.ok) {
            const errorMsg = `API'den kitap listesi alınamadı. (HTTP ${response.status})`;
            showNotification(errorMsg, 'error');
            throw new Error(errorMsg);
        }

        const data = await response.json(); // Örnek yanıt: { "kitap_idleri": [101, 102, 103] }
        renderBookList(data.kitap_idleri);

    } catch (error) {
        const friendlyErrorMsg = getUserFriendlyErrorMessage(error);
        const errorMsg = `Hata: ${friendlyErrorMsg}`;
        bookListContainer.innerHTML = `<p style="color: red;">${errorMsg}</p>`;
        showNotification(friendlyErrorMsg, 'error');
    }
}

// 3. Adım: Gelen kitap ID'leri ile checkbox listesini oluştur
function renderBookList(kitapIds) {
    if (!kitapIds || kitapIds.length === 0) {
        bookListContainer.innerHTML = '<p>Bu kriterlere uygun kitap bulunamadı.</p>';
        return;
    }

    bookListContainer.innerHTML = ''; // Temizle
    kitapIds.forEach(id => {
        const div = document.createElement('div');
        div.className = 'book-item';
        div.innerHTML = `
            <label>
                <input type="checkbox" class="book-checkbox" value="${id}">
                Kitap ID: ${id}
            </label>
        `;
        bookListContainer.appendChild(div);
    });
}

// 4. Adım: "Tümünü Seç" checkbox'ının mantığı
selectAllCheckbox.addEventListener('change', (event) => {
    const checkboxes = document.querySelectorAll('.book-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = event.target.checked;
    });
});

// 5. Adım: "Tamam" butonuna basıldığında seçili ID'leri ana sürece gönder
confirmBtn.addEventListener('click', () => {
    const selectedIds = [];
    const checkboxes = document.querySelectorAll('.book-checkbox:checked');
    checkboxes.forEach(checkbox => {
        selectedIds.push(parseInt(checkbox.value));
    });

    // Ana sürece veriyi gönder, o da ana pencereye iletecek
    ipcRenderer.send('selection-complete', selectedIds);
});

// CSS animasyonlarını ekle
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        .notification-content {
            display: flex;
            align-items: center;
            flex: 1;
        }
        .notification-icon {
            margin-right: 8px;
            font-weight: bold;
        }
        .notification-close {
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            cursor: pointer;
            margin-left: 10px;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .notification-close:hover {
            opacity: 0.7;
        }
    `;
    document.head.appendChild(style);
});