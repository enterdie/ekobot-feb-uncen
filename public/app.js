let kbData = {};
let activeTab = 'start';
let isBotRunning = false;

// Format Markdown-like text to HTML for chat display
function formatMarkdown(text) {
  if (!text) return '';
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold: **text**
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Line breaks
    .replace(/\n/g, '<br>')
    // Links: [text](url)
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color:#a78bfa;text-decoration:underline;">$1</a>');
  return formatted;
}

// Fetch knowledge base from server
async function fetchKB() {
  const statusBadge = document.getElementById('system-status');
  try {
    const res = await fetch('/api/kb');
    kbData = await res.json();
    updateEditorContent();
    
    if (statusBadge) {
      statusBadge.querySelector('.status-dot').className = 'status-dot green';
      statusBadge.querySelector('.status-label').innerText = 'Server Local Aktif';
    }
  } catch (err) {
    console.error('Error fetching Knowledge Base:', err);
    if (statusBadge) {
      statusBadge.querySelector('.status-dot').className = 'status-dot red';
      statusBadge.querySelector('.status-label').innerText = 'Server Mati / Jalankan node server.js';
    }
  }
}

// Switch between tabs in Knowledge Base Editor
function switchKBTab(key) {
  // Update active tab button UI
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    const text = btn.innerText.toLowerCase();
    let isMatch = false;
    if (key === 'start' && text.includes('welcome')) isMatch = true;
    else if (key === 'jadwalkuliah' && text.includes('jadwal kuliah')) isMatch = true;
    else if (key === 'janjian' && text.includes('jadwal ujian')) isMatch = true;
    else if (key === 'akt' && text.includes('akuntansi')) isMatch = true;
    else if (key === 'man' && text.includes('manajemen')) isMatch = true;
    else if (key === 'ie' && text.includes('ilmu ekonomi')) isMatch = true;
    else if (key === 'tugasakhir' && text.includes('tugas akhir')) isMatch = true;
    else if (key === 'zi' && text.includes('zona')) isMatch = true;
    else if (key === 'faq_krs_isi' && text.includes('krs')) isMatch = true;
    else if (key === 'faq_nilai_portal' && text.includes('nilai')) isMatch = true;
    else if (key === 'faq_reset_portal' && text.includes('reset')) isMatch = true;
    else if (key === 'faq_sempro_daftar' && text.includes('sempro')) isMatch = true;
    else if (key === 'faq_sidang_daftar' && text.includes('ujian/sidang')) isMatch = true;
    else if (key === 'faq_sp_daftar' && text.includes('antara')) isMatch = true;
    else if (key === 'faq_pddikti_ubah' && text.includes('pddikti')) isMatch = true;
    else if (key === 'faq_pindah_prodi' && text.includes('pindah')) isMatch = true;
    else if (text.includes(key)) isMatch = true;

    if (isMatch) {
      btn.classList.add('active');
    }
  });

  // Save current input to memory before switching
  kbData[activeTab] = document.getElementById('kb-textarea').value;

  activeTab = key;
  updateEditorContent();
}

function updateEditorContent() {
  const titles = {
    start: 'Welcome Message',
    kaldik: 'Kalender Akademik',
    jadwalkuliah: 'Jadwal Kuliah',
    janjian: 'Jadwal Ujian (UTS & UAS)',
    akt: 'Program Studi S1 Akuntansi',
    man: 'Program Studi S1 Manajemen',
    ie: 'Program Studi S1 Ilmu Ekonomi',
    beasiswa: 'Informasi Beasiswa',
    tugasakhir: 'Prosedur Tugas Akhir',
    zi: 'Pembangunan Zona Integritas',
    kontak: 'Kontak & Lokasi',
    faq_krs_isi: 'FAQ: Pengisian KRS',
    faq_nilai_portal: 'FAQ: Informasi Nilai Portal',
    faq_reset_portal: 'FAQ: Reset Password Portal',
    faq_sempro_daftar: 'FAQ: Pendaftaran Seminar Proposal',
    faq_sidang_daftar: 'FAQ: Pendaftaran Seminar Hasil / Skripsi',
    faq_sp_daftar: 'FAQ: Pendaftaran Semester Antara',
    faq_pddikti_ubah: 'FAQ: Perubahan Data PDDikti',
    faq_pindah_prodi: 'FAQ: Perpindahan Program Studi (Prodi)',
    fallback: 'Fallback Response'
  };

  document.getElementById('current-kb-title').innerText = titles[activeTab] || activeTab;
  document.getElementById('kb-textarea').value = kbData[activeTab] || '';
}

// Save only current active tab to server
async function saveCurrentKBTab() {
  kbData[activeTab] = document.getElementById('kb-textarea').value;
  await saveKBToServer();
}

// Save all modifications to server
async function saveAllKB() {
  kbData[activeTab] = document.getElementById('kb-textarea').value;
  await saveKBToServer();
}

async function saveKBToServer() {
  try {
    const res = await fetch('/api/kb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kbData)
    });
    const result = await res.json();
    if (result.success) {
      showToast('Basis Pengetahuan berhasil disimpan!');
    } else {
      showToast('Gagal menyimpan Basis Pengetahuan!', true);
    }
  } catch (err) {
    console.error('Error saving KB:', err);
    showToast('Koneksi server gagal!', true);
  }
}

// SIMULATOR MESSAGING
function appendMessage(sender, text) {
  const container = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'message-bubble';
  bubbleDiv.innerHTML = formatMarkdown(text);

  const timeDiv = document.createElement('div');
  timeDiv.className = 'message-time';
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  timeDiv.innerText = `${hours}:${minutes}`;

  msgDiv.appendChild(bubbleDiv);
  msgDiv.appendChild(timeDiv);
  container.appendChild(msgDiv);

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// Session identifier for simulator
const simulatorSessionId = 'session_' + Math.random().toString(36).substring(2, 9);

async function sendUserMessage() {
  const inputEl = document.getElementById('chat-input');
  const text = inputEl.value.trim();
  if (!text) return;

  // Clear input
  inputEl.value = '';

  // Append user bubble
  appendMessage('user', text);

  // Call simulator endpoint
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: simulatorSessionId })
    });
    const result = await res.json();
    
    // Simulate slight bot typing delay
    setTimeout(() => {
      appendMessage('bot', result.response);
    }, 400);
  } catch (err) {
    console.error('Error sending message to simulator:', err);
    appendMessage('bot', '⚠️ Gagal terhubung ke simulator backend.');
  }
}

function sendSimulatedMessage(command) {
  appendMessage('user', command);
  
  // Directly trigger simulation fetch
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: command, sessionId: simulatorSessionId })
  })
  .then(res => res.json())
  .then(result => {
    setTimeout(() => {
      appendMessage('bot', result.response);
    }, 400);
  })
  .catch(err => {
    console.error('Error sending message:', err);
    appendMessage('bot', '⚠️ Gagal terhubung ke simulator.');
  });
}

function handleKeyPress(e) {
  if (e.key === 'Enter') {
    sendUserMessage();
  }
}

// TELEGRAM BOT CONFIGURATION
async function checkBotStatus() {
  try {
    const res = await fetch('/api/bot/status');
    const statusInfo = await res.json();
    
    const indicator = document.getElementById('bot-status-indicator');
    const badgeText = document.getElementById('bot-status-text');
    const badgeDot = document.getElementById('bot-status-dot');
    const btnToggle = document.getElementById('btn-toggle-bot');
    const tokenInput = document.getElementById('bot-token');

    if (statusInfo.status === 'running') {
      isBotRunning = true;
      indicator.className = 'status-indicator running';
      indicator.innerText = 'ONLINE';
      
      badgeText.innerText = 'Bot Telegram Aktif';
      badgeDot.className = 'status-dot green';
      
      btnToggle.innerHTML = '<i class="fa-solid fa-stop"></i> Matikan Bot';
      btnToggle.className = 'btn btn-danger';
      
      if (statusInfo.hasToken) {
        tokenInput.value = '••••••••••••••••••••';
        tokenInput.disabled = true;
      }
    } else {
      isBotRunning = false;
      indicator.className = 'status-indicator stopped';
      indicator.innerText = 'OFFLINE';
      
      badgeText.innerText = 'Bot Telegram Offline';
      badgeDot.className = 'status-dot gray';
      
      btnToggle.innerHTML = '<i class="fa-solid fa-play"></i> Aktifkan Bot';
      btnToggle.className = 'btn btn-primary';
      
      tokenInput.disabled = false;
      if (tokenInput.value === '••••••••••••••••••••') {
        tokenInput.value = '';
      }
    }
  } catch (err) {
    console.error('Error checking bot status:', err);
  }
}

async function toggleTelegramBot() {
  const tokenInput = document.getElementById('bot-token');
  const token = tokenInput.value.trim();

  if (!isBotRunning) {
    if (!token) {
      showToast('Harap masukkan token API bot Telegram!', true);
      return;
    }

    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', token: token })
      });
      const result = await res.json();
      if (result.success) {
        showToast('Bot Telegram berhasil dijalankan!');
        checkBotStatus();
      } else {
        showToast('Gagal menjalankan Bot: ' + result.message, true);
      }
    } catch (err) {
      console.error('Error starting bot:', err);
      showToast('Kesalahan jaringan!', true);
    }
  } else {
    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      const result = await res.json();
      if (result.success) {
        showToast('Bot Telegram dihentikan.');
        tokenInput.value = '';
        checkBotStatus();
      }
    } catch (err) {
      console.error('Error stopping bot:', err);
      showToast('Kesalahan jaringan!', true);
    }
  }
}

// TOAST NOTIFICATIONS
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.right = '24px';
  toast.style.background = isError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)';
  toast.style.color = '#fff';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '12px';
  toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';
  toast.style.zIndex = '1000';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '600';
  toast.style.backdropFilter = 'blur(10px)';
  toast.style.border = '1px solid rgba(255,255,255,0.1)';
  toast.style.transform = 'translateY(100px)';
  toast.style.opacity = '0';
  toast.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  
  toast.innerText = message;
  document.body.appendChild(toast);
  
  // Trigger slide in
  setTimeout(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  }, 50);

  // Dismiss
  setTimeout(() => {
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3000);
}

// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
  fetchKB();
  checkBotStatus();
  
  // Set default welcome bubble to load from KB
  setTimeout(() => {
    if (kbData.start) {
      const container = document.getElementById('chat-messages');
      container.innerHTML = '';
      appendMessage('bot', kbData.start);
    }
  }, 500);
});
