        // Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDpyrC1-1xl6pyCLKBd4mZbW93K1F95FJs",
  authDomain: "nihongo-journey.firebaseapp.com",
  projectId: "nihongo-journey",
  storageBucket: "nihongo-journey.firebasestorage.app",
  messagingSenderId: "966989016758",
  appId: "1:966989016758:web:25d43be34bbc1a1342c017",
  measurementId: "G-2J392RPFMR"
};
     // Initialize Firebase
 firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
    // Dashboard Progress Client JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        // Show loading state
        showLoading(true);
        
        // Fetch user profile and progress data
        const [userProfile, progressData] = await Promise.all([
            fetchUserProfile(),
            fetchUserProgress()
        ]);
        
        // Update UI with fetched data
        updateUserProfile(userProfile);
        updateProgressStats(progressData);
        
        // Hide loading state and show content
        showLoading(false);
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showError('Gagal memuat data dashboard. Silakan refresh halaman.');
        showLoading(false);
    }
}

// Fetch user profile dari API
async function fetchUserProfile() {
    try {
        const response = await fetch('/api/user/profile', {
            method: 'GET',
            credentials: 'include' // Include cookies for authentication
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
        
    } catch (error) {
        console.error('Error fetching user profile:', error);
        throw error;
    }
}

// Fetch user progress dari API
async function fetchUserProgress() {
    try {
        // Get user profile first to get UID
        const userProfile = await fetchUserProfile();

        // Tambahkan listener onValue dari Firebase (CDN style)
        const db = firebase.database(); // pakai CDN syntax
        const progressRef = db.ref(`progress/${userProfile.uid}`);
        progressRef.on('value', (snapshot) => {
            const progress = snapshot.val() || {};
            console.log("progress updated");
            // Tambahkan logika listener jika dibutuhkan
        });

        // Kode asli tetap jalan
        const response = await fetch(`/api/progress/${userProfile.uid}`, {
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


// Update user profile di UI
function updateUserProfile(userProfile) {
    try {
        // Update user photo
        const userPhoto = document.getElementById('userPhoto');
        if (userPhoto && userProfile.picture) {
            userPhoto.src = userProfile.picture;
            userPhoto.alt = userProfile.name || 'User Photo';
        }
        const displayName  = document.getElementById('displayName');
        if (displayName) {
           displayName.textContent =  userProfile.name || 'New User';
        }
        // Update user name
        const userName = document.getElementById('userName');
        if (userName) {
            userName.textContent = userProfile.name || userProfile.email?.split('@')[0] || 'User';
        }
        
        console.log('User profile updated successfully');
        
    } catch (error) {
        console.error('Error updating user profile:', error);
    }
}

// Update progress statistics di UI
function updateProgressStats(progressData) {
    try {
        // Calculate statistics dari progress data
        const stats = calculateProgressStats(progressData);
        
        // Update completed lessons
        updateCompletedLessons(stats.completedLessons);
        
        // Update current level
        updateCurrentLevel(stats.currentLevel);
        
        // Update completion percentage
        updateCompletionPercentage(stats.completionPercentage);
        
        // Update total study time
        updateTotalStudyTime(stats.totalStudyTime);
        
        // Update vocabulary and kanji stats
        updateVocabularyStats(stats.vocabularyLearned);
        updateKanjiStats(stats.kanjiLearned);
        
        console.log('Progress stats updated successfully');
        
    } catch (error) {
        console.error('Error updating progress stats:', error);
    }
}

// Calculate progress statistics dari raw data
function calculateProgressStats(progressData) {
    const topics = Object.keys(progressData);
    const totalLessons = 10; // Sesuai dengan HTML yang ada
    
    // Hitung lesson yang sudah selesai
    const completedLessons = topics.filter(topic => progressData[topic].completed).length;
    
    // Hitung total waktu belajar (dalam menit)
    const totalStudyTimeMinutes = topics.reduce((total, topic) => {
        return total + (progressData[topic].totalStudyTime || 0);
    }, 0);
    
    // Hitung completion percentage
    const completionPercentage = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;
    
    // Tentukan level berdasarkan completion percentage
    let currentLevel = 'N5';
    if (completionPercentage >= 80) {
        currentLevel = 'N3';
    } else if (completionPercentage >= 50) {
        currentLevel = 'N4';
    } else if (completionPercentage >= 20) {
        currentLevel = 'Beginner';
    }
    
    // Estimasi vocabulary dan kanji berdasarkan lessons completed
    const vocabularyLearned = completedLessons * 8; // Estimasi 8 kata per lesson
    const kanjiLearned = Math.floor(completedLessons * 2.5); // Estimasi 2-3 kanji per lesson
    
    return {
        completedLessons,
        totalLessons,
        completionPercentage: Math.round(completionPercentage),
        totalStudyTime: totalStudyTimeMinutes,
        currentLevel,
        vocabularyLearned,
        kanjiLearned,
        progressData
    };
}

// Update completed lessons di UI
function updateCompletedLessons(completedCount) {
    const completedLessonsElement = document.getElementById('completedLessons');
    if (completedLessonsElement) {
        completedLessonsElement.textContent = completedCount;
        completedLessonsElement.classList.remove('hidden');
        
        // Update total lessons display juga
        const totalLessonsElement = completedLessonsElement.previousElementSibling;
        if (totalLessonsElement) {
            totalLessonsElement.textContent = `${completedCount}/5`;
        }
    }
}

// Update current level di UI
function updateCurrentLevel(level) {
    const currentLevelElement = document.getElementById('currentLevel');
    if (currentLevelElement) {
        currentLevelElement.textContent = level;
        
        // Update color based on level
        currentLevelElement.className = 'text-2xl font-bold';
        if (level === 'Mahir') {
            currentLevelElement.classList.add('text-green-600');
        } else if (level === 'Menengah') {
            currentLevelElement.classList.add('text-blue-600');
        } else if (level === 'Dasar') {
            currentLevelElement.classList.add('text-yellow-600');
        } else {
            currentLevelElement.classList.add('text-purple-600');
        }
    }
}

// Update completion percentage di UI
function updateCompletionPercentage(percentage) {
    const completionPercentageElement = document.getElementById('completionPercentage');
    const completionBarElement = document.getElementById('completionBar');
    
    if (completionPercentageElement) {
        completionPercentageElement.textContent = `${percentage}%`;
    }
    
    if (completionBarElement) {
        completionBarElement.style.width = `${percentage}%`;
        
        // Update bar color based on percentage
        completionBarElement.className = 'h-2 rounded-full transition-all duration-500';
        if (percentage >= 80) {
            completionBarElement.classList.add('bg-green-500');
        } else if (percentage >= 50) {
            completionBarElement.classList.add('bg-blue-500');
        } else if (percentage >= 20) {
            completionBarElement.classList.add('bg-yellow-500');
        } else {
            completionBarElement.classList.add('bg-red-500');
        }
    }
}

// Update total study time di UI
function updateTotalStudyTime(totalMinutes) {
    const totalStudyTimeElement = document.getElementById('totalStudyTime');
    if (totalStudyTimeElement) {
        const formattedTime = formatStudyTime(totalMinutes);
        totalStudyTimeElement.textContent = formattedTime;
    }
}

// Format study time dari menit ke format yang readable
function formatStudyTime(minutes) {
    if (minutes < 60) {
        return `${minutes} menit`;
    } else if (minutes < 1440) { // Less than 24 hours
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0 ? `${hours} jam ${remainingMinutes} menit` : `${hours} jam`;
    } else {
        const days = Math.floor(minutes / 1440);
        const remainingHours = Math.floor((minutes % 1440) / 60);
        return remainingHours > 0 ? `${days} hari ${remainingHours} jam` : `${days} hari`;
    }
}

// Update vocabulary stats di UI
function updateVocabularyStats(vocabularyCount) {
    const vocabularyLearnedElement = document.getElementById('vocabularyLearned');
    if (vocabularyLearnedElement) {
        vocabularyLearnedElement.textContent = vocabularyCount;
    }
}

// Update kanji stats di UI
function updateKanjiStats(kanjiCount) {
    const kanjiLearnedElement = document.getElementById('kanjiLearned');
    if (kanjiLearnedElement) {
        kanjiLearnedElement.textContent = kanjiCount;
    }
}

// Show/hide loading state
function showLoading(show) {
    const loadingElement = document.getElementById('loading');
    const statsContainer = document.getElementById('statsContainer');
    
    if (show) {
        if (loadingElement) loadingElement.classList.remove('hidden');
        if (statsContainer) statsContainer.classList.add('hidden');
    } else {
        if (loadingElement) loadingElement.classList.add('hidden');
        if (statsContainer) statsContainer.classList.remove('hidden');
    }
}
 function updateDateTime() {
    const hariIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const bulanIndo = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    // Buat objek waktu dengan zona waktu WIB (UTC+7)
    const now = new Date();

    // Konversi ke WIB manual (karena JS default pakai local time browser)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000); // offset ke UTC
    const wib = new Date(utc + (7 * 60 * 60000)); // tambah 7 jam

    // Format tanggal
    const hari = hariIndo[wib.getDay()];
    const tanggal = wib.getDate();
    const bulan = bulanIndo[wib.getMonth()];
    const tahun = wib.getFullYear();
    const tanggalLengkap = `${hari}, ${tanggal} ${bulan} ${tahun}`;

    // Format waktu
    let jam = wib.getHours();
    let menit = wib.getMinutes();
    jam = jam < 10 ? '0' + jam : jam;
    menit = menit < 10 ? '0' + menit : menit;
    const waktu = `${jam}:${menit} WIB`;

    // Tampilkan ke elemen HTML
    document.getElementById("Daysistem").textContent = tanggalLengkap;
    document.getElementById("Date-time").textContent = waktu;
  }

  // Update saat halaman dimuat
  updateDateTime();
  // Perbarui setiap 30 detik
  setInterval(updateDateTime, 30000);

// Show error message
function showError(message) {
    // Create error notification
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    errorDiv.innerHTML = `
        <div class="flex items-center">
            <span class="mr-2">⚠️</span>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                ×
            </button>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 5000);
}

// Setup sign out functionality
document.addEventListener('DOMContentLoaded', function() {
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', handleSignOut);
    }
});

// Handle sign out
async function handleSignOut() {
   try {
        await auth.signOut();
        // Clear session cookie di server
        await fetch('/api/auth/signout', { method: 'POST' });
        // Arahkan ke halaman utama
        window.location.href = '/';
    } catch (error) {
        console.error('Sign-out error:', error);
    }
}

// Refresh dashboard data
async function refreshDashboard() {
    showLoading(true);
    try {
        await initializeDashboard();
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
        showError('Gagal memperbarui data dashboard.');
        showLoading(false);
    }
}

// Export functions untuk digunakan di file lain jika diperlukan
window.dashboardAPI = {
    refreshDashboard,
    fetchUserProfile,
    fetchUserProgress
};
