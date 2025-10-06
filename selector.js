const { ipcRenderer } = require('electron');

// --- Konfigürasyon ---
const API_BASE_URL = 'http://bcaicpudev.impark.local:1071'; // API adresini kendi adresinle değiştir
// ---

const bookListContainer = document.getElementById('book-list-container');
const selectAllCheckbox = document.getElementById('select-all');
const confirmBtn = document.getElementById('confirm-selection');

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
            throw new Error('API\'den kitap listesi alınamadı.');
        }

        const data = await response.json(); // Örnek yanıt: { "kitap_idleri": [101, 102, 103] }
        renderBookList(data.kitap_idleri);

    } catch (error) {
        bookListContainer.innerHTML = `<p style="color: red;">Hata: ${error.message}</p>`;
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