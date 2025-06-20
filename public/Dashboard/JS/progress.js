// Progress Bar Client untuk Kanji, Hiragana & Katakana
class ProgressClient {
    constructor() {
        this.baseURL = '/api/progress';
        this.maxLevels = {
            kanji: 50,      // Asumsi maksimal 50 level kanji
            hiragana: 20,   // Asumsi maksimal 20 level hiragana
            katakana: 20    // Asumsi maksimal 20 level katakana
        };
        this.userProfile = null;
    }

    // Fetch user profile untuk mendapatkan UID
    async fetchUserProfile() {
        try {
            const response = await fetch('/api/user/profile', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.userProfile = data;
            return data;
        } catch (error) {
            console.error('Error fetching user profile:', error);
            throw error;
        }
    }

    // Fetch progress user berdasarkan UID
    async fetchUserProgress() {
        try {
            // Get user profile first to get UID
            if (!this.userProfile) {
                this.userProfile = await this.fetchUserProfile();
            }

            // Setup Firebase listener (opsional, untuk real-time updates)
            if (typeof firebase !== 'undefined') {
                const db = firebase.database();
                const progressRef = db.ref(`progress/${this.userProfile.uid}`);
                progressRef.on('value', (snapshot) => {
                    const progress = snapshot.val() || {};
                    console.log("Progress updated from Firebase listener");
                    // Auto refresh UI ketika ada perubahan
                    this.updateProgressFromData(progress);
                });
            }

            // Fetch dari API endpoint
            const response = await fetch(`${this.baseURL}/${this.userProfile.uid}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.progress || {};

        } catch (error) {
            console.error('Error fetching user progress:', error);
            throw error;
        }
    }

    // Hitung persentase berdasarkan currentLevel dan maxLevel
    calculatePercentage(currentLevel, maxLevel) {
        if (!currentLevel || currentLevel <= 0) return 0;
        const percentage = Math.min((currentLevel / maxLevel) * 100, 100);
        return Math.round(percentage);
    }

    // Update progress bar di UI
    updateProgressBar(elementId, percentage) {
        const progressBar = document.getElementById(elementId);
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
    }

    // Update persentase text di UI
    updatePercentageText(elementId, percentage) {
        const percentageElement = document.getElementById(elementId);
        if (percentageElement) {
            percentageElement.textContent = `${percentage}%`;
        }
    }

    // Update progress dari data yang sudah di-fetch
    updateProgressFromData(progressData) {
        // Update Kanji Progress
        const kanjiData = progressData.kanji || {};
        const kanjiPercentage = this.calculatePercentage(
            kanjiData.currentLevel || 0, 
            this.maxLevels.kanji
        );
        this.updateProgressBar('kanjiBar', kanjiPercentage);
        this.updatePercentageText('kanjiPercentage', kanjiPercentage);

        // Update Hiragana & Katakana Progress (gabungan)
        const hiraganaData = progressData.hiragana || {};
        const katakanaData = progressData.katakana || {};
        
        const hiraganaPercentage = this.calculatePercentage(
            hiraganaData.currentLevel || 0, 
            this.maxLevels.hiragana
        );
        
        const katakanaPercentage = this.calculatePercentage(
            katakanaData.currentLevel || 0, 
            this.maxLevels.katakana
        );

        // Gabungkan persentase (rata-rata)
        const combinedPercentage = Math.round((hiraganaPercentage + katakanaPercentage) / 2);
        
        this.updateProgressBar('hirakanaBar', combinedPercentage);
        this.updatePercentageText('hirakanaPercentage', combinedPercentage);

        console.log('Progress Updated:', {
            kanji: {
                currentLevel: kanjiData.currentLevel || 0,
                percentage: kanjiPercentage,
                totalQuizzes: kanjiData.totalQuizzes || 0,
                averageScore: kanjiData.averageScore || 0
            },
            hiragana: {
                currentLevel: hiraganaData.currentLevel || 0,
                percentage: hiraganaPercentage,
                totalQuizzes: hiraganaData.totalQuizzes || 0,
                averageScore: hiraganaData.averageScore || 0
            },
            katakana: {
                currentLevel: katakanaData.currentLevel || 0,
                percentage: katakanaPercentage,
                totalQuizzes: katakanaData.totalQuizzes || 0,
                averageScore: katakanaData.averageScore || 0
            },
            combined: combinedPercentage
        });
    }

    // Load semua progress sekaligus
    async loadAllProgress() {
        try {
            // Show loading state
            this.updatePercentageText('kanjiPercentage', 'Loading...');
            this.updatePercentageText('hirakanaPercentage', 'Loading...');

            // Fetch progress data
            const progressData = await this.fetchUserProgress();
            
            // Update UI dengan data yang di-fetch
            this.updateProgressFromData(progressData);

            console.log('All progress loaded successfully');
        } catch (error) {
            console.error('Error loading all progress:', error);
            
            // Set error state
            this.updatePercentageText('kanjiPercentage', 'Error');
            this.updatePercentageText('hirakanaPercentage', 'Error');
        }
    }

    // Refresh progress (untuk dipanggil setelah user menyelesaikan quiz)
    async refreshProgress() {
        await this.loadAllProgress();
    }

    // Get specific progress type data
    getProgressData(progressData, type) {
        return progressData[type] || {
            currentLevel: 1,
            totalQuizzes: 0,
            totalScore: 0,
            averageScore: 0,
            flashcardsStudied: 0
        };
    }

    // Destroy Firebase listeners (cleanup)
    cleanup() {
        if (typeof firebase !== 'undefined' && this.userProfile) {
            const db = firebase.database();
            const progressRef = db.ref(`progress/${this.userProfile.uid}`);
            progressRef.off(); // Remove all listeners
        }
    }
}

// Initialize progress client
const progressClient = new ProgressClient();

// Load progress saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    progressClient.loadAllProgress();
});

// Cleanup saat halaman di-unload
window.addEventListener('beforeunload', () => {
    progressClient.cleanup();
});

// Export untuk digunakan di file lain jika diperlukan
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgressClient;
}

// Contoh penggunaan manual:
// progressClient.refreshProgress(); // Untuk refresh progress
// progressClient.loadAllProgress(); // Load semua progress