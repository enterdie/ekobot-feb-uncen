// Qontak Chat Widget Functions
function toggleChatWidget() {
  const windowEl = document.getElementById('qontak-chat-window');
  if (windowEl) {
    windowEl.classList.toggle('show');
  }
}

// SIMULATOR FOR QONTAK WIDGET
function appendQontakMessage(sender, text) {
  const container = document.getElementById('qontak-messages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `qmsg ${sender}`;

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'qmsg-bubble';
  bubbleDiv.innerHTML = formatMarkdown(text);

  const timeDiv = document.createElement('div');
  timeDiv.className = 'qmsg-time';
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

const qontakSessionId = 'qontak_session_' + Math.random().toString(36).substring(2, 9);

async function sendQontakMessage() {
  const inputEl = document.getElementById('qontak-input');
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;

  // Clear input
  inputEl.value = '';

  // Append user message
  appendQontakMessage('user', text);

  // Call simulator endpoint
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: qontakSessionId })
    });
    const result = await res.json();
    
    // Simulate typing delay
    setTimeout(() => {
      appendQontakMessage('bot', result.response);
    }, 400);
  } catch (err) {
    console.error('Error sending Qontak message:', err);
    appendQontakMessage('bot', '⚠️ Gagal terhubung ke simulator backend.');
  }
}

function handleQontakKeyPress(e) {
  if (e.key === 'Enter') {
    sendQontakMessage();
  }
}
