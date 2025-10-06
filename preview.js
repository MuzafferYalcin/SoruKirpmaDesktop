const { ipcRenderer } = require('electron');

// --- Konfigürasyon ---
const API_BASE_URL = 'http://bcaicpudev.impark.local:1071'; 
// ---

// HTML Elemanları
const bookListContainer = document.getElementById('book-list');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const questionInfo = document.getElementById('question-info');
const originalImage = document.getElementById('original-image');
const processedImage = document.getElementById('processed-image');
const reportErrorBtn = document.getElementById('report-error-btn');
const confirmationModal = document.getElementById('confirmation-modal');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

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

// === FONKSİYONLAR ===

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
            throw new Error(data.message || 'Soru verisi alınamadı.');
        }
    } catch (error) {
        questionInfo.textContent = `Hata: ${error.message}`;
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
        alert('Hata: Resim bilgileri bulunamadı.');
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
            alert('Hata bildirimi başarıyla gönderildi.');
            // Butonu deaktif et (tekrar bildirim yapılmasın)
            reportErrorBtn.disabled = true;
            reportErrorBtn.textContent = '✓ Bildirildi';
            reportErrorBtn.classList.add('reported');
            reportErrorBtn.style.removeProperty('background-color');
        } else {
            throw new Error(data.message || 'Hata bildirimi gönderilemedi.');
        }
    } catch (error) {
        alert(`Hata bildirimi sırasında bir sorun oluştu: ${error.message}`);
    }
}