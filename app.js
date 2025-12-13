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
    // 🔥 Liderlik tablosu aside elementini yakala
    const leaderboardAside = document.querySelector('.leaderboard'); 
    const gameMessage = document.getElementById('gameMessage'); 
    
    // Temel oyun elemanları
    const gameImage = document.getElementById('gameImage');
    const wordInputArea = document.querySelector('.word-input-area');
    const virtualKeyboard = document.getElementById('virtual-keyboard');
    const currentScoreDisplay = document.getElementById('currentScore');
    const gameTimerDisplay = document.getElementById('gameTimer'); 

    // Ses Efektleri Elemanlarını yakala
    const successSound = document.getElementById('successSound');
    const errorSound = document.getElementById('errorSound');

    // --- Oyun Durumu ---
    let currentUserUid = null;
    let currentUserName = null;
    let currentWord = '';
    let currentLetters = [];
    let currentInputIndex = 0;
    
    let currentScore = 0; 
    let answeredWordIds = []; 
    let allWords = []; 

    // --- ZAMANLAYICI DEĞİŞKENLERİ ---
    let gameTimer = 120; 
    let countdownInterval;

    // 🔥 BAŞLANGIÇ GÖRÜNÜRLÜK DURUMU 🔥
    // Giriş ekranında, oyun gizli, giriş formu ve Liderlik tablosu görünüyor.
    gameContainer.style.display = 'none';      
    authModal.style.display = 'flex';          
    leaderboardAside.style.display = 'flex';   
    

    // Sesleri hazırlar.
    function primeAudio() {
        try {
            if (successSound) {
                successSound.play().catch(e => console.log("Success ses ön yükleme hatası:", e));
                successSound.pause();
                successSound.currentTime = 0;
            }
            if (errorSound) {
                errorSound.play().catch(e => console.log("Error ses ön yükleme hatası:", e));
                errorSound.pause();
                errorSound.currentTime = 0;
            }
        } catch (e) {
            console.error("Ses ön yükleme genel hatası:", e);
        }
    }

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
               
                authModal.style.display = 'none';      // Giriş ekranını gizle
                gameContainer.style.display = 'flex';  // Oyun konteynerini göster
                leaderboardAside.style.display = 'none'; // 🔥 Düzeltme: Liderlik tablosunu gizle
                
                primeAudio(); 
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
    // 2. SKOR YÖNETİMİ VE LİDERLİK TABLOSU
    // ====================================================

    function updateScoreDisplay(newScore) {
        currentScore = newScore;
        currentScoreDisplay.textContent = currentScore;
    }

    function displayMessage(text, type = 'success', duration = 2500) {
        gameMessage.classList.remove('success', 'error', 'show');
        
        gameMessage.textContent = text;
        gameMessage.classList.add(type, 'show'); 

        setTimeout(() => {
            gameMessage.classList.remove('show');
        }, duration);
    }
    
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
            const docRef = await db.collection('skorlar').add(sessionData); 
            console.log(`✅ Oturum skoru başarıyla kaydedildi: ${currentScore}, Belge ID: ${docRef.id}`);
        } catch (error) {
            console.error("❌ SKOR KAYIT HATASI:", error);
        }
    }

    function setupLeaderboardListener() {
        // Limit 30 olarak kalır (önceki düzeltmeden)
        db.collection('skorlar')
            .orderBy('score', 'desc') 
            .orderBy('timestamp', 'desc') 
            .limit(30) 
            .onSnapshot(snapshot => {
                leaderboardList.innerHTML = '';
                
                snapshot.forEach((doc, index) => {
                    const item = doc.data();
                    const listItem = document.createElement('li');
                    
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
        startTimer(); 
        fetchRandomWord(); 
    }
    
    async function fetchAllWords() {
        try {
            const snapshot = await db.collection('gorseller').get();
            if (snapshot.empty) {
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
            displayMessage('Veritabanı bağlantısında sorun oluştu.', 'error', 5000);
        }
    }

    async function fetchRandomWord() {
        const availableWords = allWords.filter(word => !answeredWordIds.includes(word.id));

        if (availableWords.length === 0) {
            clearInterval(countdownInterval);
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
        
        const timerContainer = document.querySelector('.timer-display'); 
        timerContainer.classList.remove('critical');

        countdownInterval = setInterval(() => {
            gameTimer--;
            gameTimerDisplay.textContent = gameTimer;

            // 10 saniye uyarı mantığı korunur
            if (gameTimer <= 10) {
                timerContainer.classList.add('critical');
            } else {
                 timerContainer.classList.remove('critical');
            }

            if (gameTimer <= 0) {
                clearInterval(countdownInterval);
                handleGameOver(); 
            }
        }, 1000);
    }

    function handleGameOver() {
        saveSessionScore(); 
        
        const gameOverMessage = currentScore > 0 
            ? `Oyun süreniz doldu! Toplam skorunuz: ${currentScore}.` 
            : `Oyun süreniz doldu. Skor kazanamadınız.`;
            
        displayMessage(gameOverMessage, currentScore > 0 ? 'success' : 'error', 4000);
        
        setTimeout(() => {
            gameContainer.style.display = 'none';
            authModal.style.display = 'flex'; // Giriş ekranını tekrar göster
            leaderboardAside.style.display = 'flex'; // 🔥 Düzeltme: Liderlik tablosunu tekrar göster
        }, 1000); 
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

            const newSessionScore = currentScore + totalPoints;
            updateScoreDisplay(newSessionScore); 

            const answeredWord = allWords.find(word => word.dogruKelime === currentWord);
            if (answeredWord) {
                answeredWordIds.push(answeredWord.id);
            }
            
            displayMessage(`Tebrikler! +${totalPoints} puan kazandınız!`, 'success'); 

            if (successSound) {
                successSound.currentTime = 0; 
                successSound.play();
            }

            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 150, 
                    spread: 90,        
                    origin: { y: 0.6 } 
                });
            }


            fetchRandomWord(); 
        } else {
            if (errorSound) {
                errorSound.currentTime = 0; 
                errorSound.play();
            }
            displayMessage('Yanlış cevap! Tekrar deneyin.', 'error'); 
        }
    }

    // 🔥 BAŞLANGIÇTA ÇALIŞACAK KOD 🔥
    loadStudentList();
    setupLeaderboardListener(); 
});
