// index.html'de Firebase SDK'larının yüklendiği ve const db tanımlandığı varsayılır.
document.addEventListener('DOMContentLoaded', () => {
    // --- Arayüz Elemanları ---
    const studentNameSelect = document.getElementById('studentNameSelect');
    const gameContainer = document.querySelector('.game-container');
    const authModal = document.getElementById('authModal');
    const loginBtn = document.getElementById('loginBtn');
    const studentPassword = document.getElementById('studentPassword');
    const authMessage = document.getElementById('authMessage');
    const leaderboardList = document.getElementById('topScores');
    const gameMessage = document.getElementById('gameMessage'); // YENİ: Mesaj alanını yakala
    
    // Temel oyun elemanları
    const gameImage = document.getElementById('gameImage');
    const wordInputArea = document.querySelector('.word-input-area');
    const virtualKeyboard = document.getElementById('virtual-keyboard');
    const currentScoreDisplay = document.getElementById('currentScore');
    const gameTimerDisplay = document.getElementById('gameTimer'); 

    // --- Oyun Durumu ---
    let currentUserUid = null;
    let currentUserName = null;
    let currentWord = '';
    let currentLetters = [];
    let currentInputIndex = 0;
    
    // OTURUM (SESSION) SKORU: Her girişte sıfırlanacak.
    let currentScore = 0; 
    
    // KELİME TEKRARINI ÖNLEME DEĞİŞKENLERİ
    let answeredWordIds = []; 
    let allWords = []; 

    // --- ZAMANLAYICI DEĞİŞKENLERİ ---
    let gameTimer = 120; // TOPLAM OYUN SÜRESİ (2 dakika)
    let countdownInterval;

    gameContainer.style.display = 'none';

    // ====================================================
    // 1. GİRİŞ MODÜLÜ VE VERİ ÇEKME
    // ====================================================

    async function loadStudentList() {
        try {
            const snapshot = await db.collection('ogrenciler').get();
            if (snapshot.empty) {
                authMessage.textContent = 'Veritabanında öğrenci kaydı bulunamadı.';
                return;
            }
            snapshot.forEach(doc => {
                const data = doc.data();
                const option = document.createElement('option');
                option.value = doc.id; 
                option.textContent = data.isim;
                studentNameSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Öğrenci listesi yüklenirken hata:", error);
            authMessage.textContent = "Öğrenci listesi yüklenemedi. Bağlantıyı kontrol edin.";
        }
    }

    // Giriş Kontrolü
    loginBtn.addEventListener('click', async () => {
        const selectedUid = studentNameSelect.value;
        const enteredPassword = studentPassword.value;
        
        if (!selectedUid) {
            authMessage.textContent = "Lütfen listeden adınızı seçin.";
            return;
        }

        try {
            const studentDoc = await db.collection('ogrenciler').doc(selectedUid).get();
            
            if (!studentDoc.exists) {
                authMessage.textContent = "Öğrenci kaydı veritabanında bulunamadı!";
                return;
            }

            const studentData = studentDoc.data();
            const expectedPassword = studentData.sifre;

            if (enteredPassword === expectedPassword) {
                currentUserUid = selectedUid;
                currentUserName = studentNameSelect.options[studentNameSelect.selectedIndex].textContent;
                
                authModal.style.display = 'none';
                gameContainer.style.display = 'flex';
                
                initializeGame(); 

            } else {
                authMessage.textContent = "Şifre hatalı. Lütfen tekrar deneyin.";
            }
        } catch (error) {
            console.error("Giriş sırasında hata oluştu:", error);
            authMessage.textContent = "Giriş işlemi sırasında bir hata oluştu.";
        }
    });

    // ====================================================
    // 2. SKOR YÖNETİMİ VE LİDERLİK TABLOSU (OTURUM BAZLI)
    // ====================================================

    function updateScoreDisplay(newScore) {
        currentScore = newScore;
        currentScoreDisplay.textContent = currentScore;
    }

    // YENİ FONKSİYON: Mesajı ekranda gösterir (Alert yerine)
    function displayMessage(text, type = 'success', duration = 2500) {
        // Tipi (success veya error) ve süreyi (milisaniye) alır
        
        // Önceki mesajları ve sınıfları temizle
        gameMessage.classList.remove('success', 'error', 'show');
        
        gameMessage.textContent = text;
        gameMessage.classList.add(type, 'show'); // Yeni tipi ve 'show' sınıfını ekle

        // Belirtilen süre sonra mesajı gizle
        setTimeout(() => {
            gameMessage.classList.remove('show');
        }, duration);
    }
    
    // KRİTİK FONKSİYON: Oturum skorunu veritabanına yeni bir kayıt olarak ekler
    async function saveSessionScore() {
        if (!currentUserUid || currentScore <= 0) {
             console.log("Skor 0 veya eksi olduğu için kaydedilmedi.");
             return; 
        }

        const sessionData = {
            uid: currentUserUid,
            score: currentScore, 
            userName: currentUserName, 
            timestamp: firebase.firestore.FieldValue.serverTimestamp() 
        };

        try {
            // Firestore'da 'skorlar' koleksiyonuna yeni bir belge ekle
            const docRef = await db.collection('skorlar').add(sessionData); 
            console.log(`✅ Oturum skoru başarıyla kaydedildi: ${currentScore}, Belge ID: ${docRef.id}`);
        } catch (error) {
            console.error("❌ SKOR KAYIT HATASI:", error);
        }
    }

    function setupLeaderboardListener() {
        // Liderlik tablosu en yüksek skorlu oturumları listeler.
        db.collection('skorlar')
            .orderBy('score', 'desc') 
            .orderBy('timestamp', 'desc') 
            .limit(10) 
            .onSnapshot(snapshot => {
                leaderboardList.innerHTML = '';
                
                snapshot.forEach((doc, index) => {
                    const item = doc.data();
                    const listItem = document.createElement('li');
                    
                    // Format: Ahmet 1550
                    listItem.textContent = `${item.userName}`; 
                    const scoreSpan = document.createElement('span');
                    scoreSpan.textContent = item.score;
                    listItem.appendChild(scoreSpan);
                    leaderboardList.appendChild(listItem);
                });
            }, error => {
                console.error("❌ LİDERLİK TABLOSU OKUMA HATASI:", error);
            });
    }

    // ====================================================
    // 3. OYUN BAŞLATMA VE MANTIK
    // ====================================================

    async function initializeGame() {
        currentScore = 0; 
        gameTimer = 120; 
        answeredWordIds = []; 
        updateScoreDisplay(0); 

        await fetchAllWords(); 
        setupLeaderboardListener(); 
        startTimer(); 
        fetchRandomWord(); 
    }
    
    // Tüm kelimeleri veritabanından çek ve allWords dizisine kaydet
    async function fetchAllWords() {
        try {
            const snapshot = await db.collection('gorseller').get();
            if (snapshot.empty) {
                // ALERT KALDIRILDI
                displayMessage('Veritabanında görsel bulunamadı!', 'error', 5000);
                allWords = [];
                return;
            }
            allWords = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Tüm görseller çekilirken hata oluştu:", error);
            // ALERT KALDIRILDI
            displayMessage('Veritabanı bağlantısında sorun oluştu.', 'error', 5000);
        }
    }

    // --- GÖRSEL VE KELİME ÇEKME (Tekrarı Önleme) ---
    async function fetchRandomWord() {
        const availableWords = allWords.filter(word => !answeredWordIds.includes(word.id));

        if (availableWords.length === 0) {
            clearInterval(countdownInterval);
            // ALERT KALDIRILDI
            displayMessage(`Tebrikler! Tüm kelimeleri cevapladınız! Skorunuz: ${currentScore}`, 'success', 5000);
            handleGameOver(); 
            return;
        }

        const randomIndex = Math.floor(Math.random() * availableWords.length);
        const wordData = availableWords[randomIndex];
        
        currentWord = wordData.dogruKelime;
        gameImage.src = wordData.gorselUrl;
        
        createLetterBoxes(wordData.uzunluk);
    }
    
    function createLetterBoxes(length) {
        wordInputArea.innerHTML = '';
        currentLetters = Array(length).fill('');
        currentInputIndex = 0;

        for (let i = 0; i < length; i++) {
            const box = document.createElement('div');
            box.className = 'letter-box';
            box.setAttribute('data-index', i);
            wordInputArea.appendChild(box);
        }
        updateFocus();
    }
    
    function updateFocus() {
        document.querySelectorAll('.letter-box').forEach(box => {
            box.classList.remove('current-input');
        });

        if (currentInputIndex < currentLetters.length) {
            const activeBox = document.querySelector(`.letter-box[data-index="${currentInputIndex}"]`);
            if (activeBox) {
                activeBox.classList.add('current-input');
            }
        }
    }

    // --- ZAMANLAYICI MANTIK FONKSİYONLARI ---

    function startTimer() {
        clearInterval(countdownInterval);
        gameTimerDisplay.textContent = gameTimer;
        
        countdownInterval = setInterval(() => {
            gameTimer--;
            gameTimerDisplay.textContent = gameTimer;

            if (gameTimer <= 0) {
                clearInterval(countdownInterval);
                handleGameOver(); 
            }
        }, 1000);
    }

    function handleGameOver() {
        // Oyun bitince skoru kaydetme işlemini yapar.
        saveSessionScore(); 
        
        const gameOverMessage = currentScore > 0 
            ? `Oyun süreniz doldu! Toplam skorunuz: ${currentScore}.` 
            : `Oyun süreniz doldu. Skor kazanamadınız.`;
            
        displayMessage(gameOverMessage, currentScore > 0 ? 'success' : 'error', 4000);
        
        // Mesajı gösterdikten sonra arayüzü gizle
        setTimeout(() => {
            gameContainer.style.display = 'none';
            authModal.style.display = 'flex'; 
        }, 1000); // Kullanıcının mesajı okuması için 1 saniye bekle

    }

    // ====================================================
    // 4. SANAL KLAVYE İŞLEMLERİ
    // ====================================================

    function createKeyButton(text, dataKey) {
        const button = document.createElement('button');
        button.className = 'key';
        button.textContent = text;
        button.setAttribute('data-key', dataKey);
        return button;
    }

    const keys = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split('');
    keys.forEach(letter => {
        const button = createKeyButton(letter, letter);
        virtualKeyboard.appendChild(button);
    });

    const deleteKey = createKeyButton('SİL', 'DELETE');
    const submitKey = createKeyButton('ONAYLA', 'SUBMIT');
    deleteKey.classList.add('action-key', 'delete-key');
    submitKey.classList.add('action-key', 'submit-key');
    virtualKeyboard.appendChild(deleteKey);
    virtualKeyboard.appendChild(submitKey);

    virtualKeyboard.addEventListener('click', (event) => {
        const key = event.target.closest('.key');
        if (!key) return;

        const keyValue = key.getAttribute('data-key');
        
        if (keyValue === 'DELETE') {
            handleDelete();
        } else if (keyValue === 'SUBMIT') {
            handleSubmit();
        } else if (keyValue && keyValue.length === 1) {
            handleLetterInput(keyValue);
        }
    });

    function handleLetterInput(letter) {
        if (currentInputIndex < currentLetters.length) {
            const activeBox = document.querySelector(`.letter-box[data-index="${currentInputIndex}"]`);
            activeBox.textContent = letter;
            currentLetters[currentInputIndex] = letter;
            
            if (currentInputIndex < currentLetters.length) {
                currentInputIndex++;
            }
            updateFocus();
        }
    }

    function handleDelete() {
        if (currentInputIndex > 0) {
            currentInputIndex--;
        }
        const activeBox = document.querySelector(`.letter-box[data-index="${currentInputIndex}"]`);
        if (activeBox) {
             activeBox.textContent = '';
             currentLetters[currentInputIndex] = '';
        }
        updateFocus();
    }

    // --- KONTROL VE PUANLAMA ---
    function handleSubmit() {
        const enteredWord = currentLetters.join('');
        // Alert yerine displayMessage kullanıldı.
        if (enteredWord.length !== currentWord.length) {
            displayMessage('Lütfen kelimeyi tamamlayın!', 'error'); 
            return;
        }
        
        if (gameTimer <= 0) {
            handleGameOver();
            return;
        }

        if (enteredWord === currentWord) {
            const baseScore = 100;
            const timeBonusPerSecond = 2;
            const bonusScore = gameTimer * timeBonusPerSecond;
            const totalPoints = baseScore + bonusScore;

            // 1. OTURUM SKORUNU GÜNCELLE
            const newSessionScore = currentScore + totalPoints;
            updateScoreDisplay(newSessionScore); 

            // 2. KELİME TEKRARINI ENGELLEME
            const answeredWord = allWords.find(word => word.dogruKelime === currentWord);
            if (answeredWord) {
                answeredWordIds.push(answeredWord.id);
            }
            
            // Alert yerine displayMessage kullanıldı.
            displayMessage(`Tebrikler! +${totalPoints} puan kazandınız!`, 'success'); 

            // YENİ: KONFETİ EFEKTİ
            if (typeof confetti === 'function') { // Konfeti kütüphanesinin yüklendiğini kontrol et
                confetti({
                    particleCount: 150, // Fırlatılacak parça sayısı
                    spread: 90,        // Yayılma açısı
                    origin: { y: 0.6 } // Ekranın ortasından biraz yukarıdan fırlat
                });
            }


            fetchRandomWord(); // Yeni kelimeyi çek
        } else {
            // Alert yerine displayMessage kullanıldı.
            displayMessage('Yanlış cevap! Tekrar deneyin.', 'error'); 
        }
    }

    // Sayfa Yüklendiğinde Öğrenci Listesini Yükle
    loadStudentList();
});