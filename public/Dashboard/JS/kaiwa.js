document.addEventListener('DOMContentLoaded', () => {
    fetchConversationProgress();
});
document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.conversation-topic');
  const target = document.getElementById('conversation-area');

  buttons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});

function fetchConversationProgress() {
    const loading = document.getElementById('loading');
    const container = document.getElementById('progressContainer');
    const emptyState = document.getElementById('emptyState');

    loading.style.display = 'block';
    container.innerHTML = '';

    fetch('/api/conversation/progress', {
        method: 'GET',
        credentials: 'include', // ⬅️ agar session cookie dikirim
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(res => {
        if (!res.ok) throw new Error('Gagal mengambil data progress.');
        return res.json();
    })
    .then(data => {
        loading.style.display = 'none';

        const entries = Object.entries(data || {})
            .filter(([_, val]) => typeof val === 'object')
            .sort(([, a], [, b]) => (b.lastStudy || 0) - (a.lastStudy || 0));

        if (entries.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        container.innerHTML = entries.map(([key, val]) => createCard(key, val)).join('');
    })
    .catch(err => {
        loading.style.display = 'none';
        container.innerHTML = `
            <div class="text-red-600 text-center py-4">
                Error: ${err.message}
            </div>`;
    });
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('id-ID', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds} detik`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} menit`;
    return `${Math.floor(seconds / 3600)} jam ${Math.floor((seconds % 3600) / 60)} menit`;
}

function createCard(key, data) {
    const topic = data.topic || key.replace('conversation_', 'Unknown');
    const totalTime = data.totalStudyTime || 0;
    const totalSessions = data.totalSessions || 0;
    const lastStudy = data.lastStudy ? formatDate(data.lastStudy) : 'Belum pernah';
    const completed = data.completed || false;
    const completedAt = data.completedAt ? formatDate(data.completedAt) : null;

    const progress = Math.min((totalSessions / 10) * 100, 100);

    return `
    <div class="bg-white rounded-xl shadow-md p-6 mb-4">
        <div class="flex justify-between mb-3">
            <div>
                <h3 class="text-xl font-semibold capitalize">${topic}</h3>
                <p class="text-sm text-gray-600">Terakhir belajar: ${lastStudy}</p>
            </div>
            <span class="text-sm px-3 py-1 rounded-full font-medium 
                ${completed ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">
                ${completed ? '✓ Selesai' : 'Berlangsung'}
            </span>
        </div>

        <div class="mb-2">
            <div class="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress</span>
                <span>${totalSessions}/10 sesi</span>
            </div>
            <div class="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div class="h-3 bg-gradient-to-r from-blue-500 to-purple-600 transition-all"
                    style="width: ${progress}%"></div>
            </div>
            <p class="text-right text-xs mt-1 text-gray-500">${Math.round(progress)}%</p>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center mt-3">
            <div>
                <p class="text-blue-600 text-lg font-bold">${totalSessions}</p>
                <p class="text-xs text-gray-500">Total Sesi</p>
            </div>
            <div>
                <p class="text-purple-600 text-lg font-bold">${formatDuration(totalTime)}</p>
                <p class="text-xs text-gray-500">Waktu Belajar</p>
            </div>
            <div>
                <p class="text-green-600 text-lg font-bold">${Math.round(totalTime / Math.max(totalSessions, 1))}s</p>
                <p class="text-xs text-gray-500">Rata-rata</p>
            </div>
        </div>

        ${completedAt ? `<p class="mt-4 text-sm text-green-600">✅ Selesai pada ${completedAt}</p>` : ''}
    </div>
    `;
}
