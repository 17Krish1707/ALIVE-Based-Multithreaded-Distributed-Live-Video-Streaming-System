// ============================================================
// THEME SWITCHER LOGIC (Dark / Light Mode)
// ============================================================
const currentTheme = localStorage.getItem('alive_theme') || 'dark';
applyTheme(currentTheme);

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('alive_theme', theme);
  
  const themeBtns = document.querySelectorAll('.theme-toggle-btn');
  themeBtns.forEach(btn => {
    const icon = btn.querySelector('.theme-icon');
    const text = btn.querySelector('.theme-text');
    if (theme === 'light') {
      if (icon) icon.textContent = '🌙';
      if (text) text.textContent = 'Dark Mode';
    } else {
      if (icon) icon.textContent = '☀️';
      if (text) text.textContent = 'Light Mode';
    }
  });
}

function toggleTheme() {
  const active = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = active === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
  btn.addEventListener('click', toggleTheme);
});

// ============================================================
// CLIENT IDENTIFICATION & SOCKET INITIALIZATION
// ============================================================
let clientId = localStorage.getItem('alive_client_id');
if (!clientId) {
  clientId = `CLIENT-${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('alive_client_id', clientId);
}

const socket = typeof io !== 'undefined'
  ? io(window.location.origin, { transports: ['websocket', 'polling'] })
  : { on: () => {}, emit: () => {} };

// DOM Elements
const clientIdBadge = document.getElementById('client-id-badge');
const streamStatusBadge = document.getElementById('stream-status-badge');
const watchBtn = document.getElementById('watch-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const videoPlaceholder = document.getElementById('video-placeholder');
const streamPlayer = document.getElementById('stream-player');
const placeholderText = document.getElementById('placeholder-text');
const liveHud = document.getElementById('live-hud');
const hudSource = document.getElementById('hud-source');
const hudThread = document.getElementById('hud-thread');

const activeSourceName = document.getElementById('active-source-name');
const activeSourceType = document.getElementById('active-source-type');
const activeSourceLatency = document.getElementById('active-source-latency');

const metaVideoName = document.getElementById('meta-video-name');
const metaWorkerThread = document.getElementById('meta-worker-thread');
const metaReqTime = document.getElementById('meta-req-time');
const metaAllocTime = document.getElementById('meta-alloc-time');
const metaVtsTime = document.getElementById('meta-vts-time');
const metaStartTime = document.getElementById('meta-start-time');
const metaLivePos = document.getElementById('meta-live-pos');
const metaChunkInfo = document.getElementById('meta-chunk-info');
const durationClock = document.getElementById('duration-clock');

const failoverBanner = document.getElementById('failover-banner');
const failoverDetails = document.getElementById('failover-details');
const switchHistoryList = document.getElementById('switch-history-list');

// Timers and state
let durationTimer = null;
let streamStartTime = null;
let videoDuration = 0;
let serverStreamStartTime = null;
let currentSourceId = null;

// Initialize
clientIdBadge.textContent = clientId;

// Configure HTML5 Video Player
streamPlayer.playsInline = true;
streamPlayer.controls = true;

streamPlayer.addEventListener('loadedmetadata', () => {
  if (streamPlayer.duration && !isNaN(streamPlayer.duration)) {
    videoDuration = streamPlayer.duration;
  }
  updateTimelineDisplay();
});

streamPlayer.addEventListener('timeupdate', () => {
  updateTimelineDisplay();
});

streamPlayer.addEventListener('ended', () => {
  console.log('Video reached end. Looping for continuous live broadcast...');
  streamPlayer.currentTime = 0;
  streamPlayer.play().catch(e => console.log('Loop playback handled:', e));
});

function updateTimelineDisplay() {
  const cur = formatDuration(streamPlayer.currentTime);
  const total = formatDuration(videoDuration || streamPlayer.duration || 0);
  metaLivePos.textContent = `${cur} / ${total}`;
}

// ============================================================
// SOCKET LISTENERS
// ============================================================
socket.on('connect', () => {
  console.log('Connected to VTS server, registering client...');
  socket.emit('client_register', { clientId });
});

socket.on('client_registered', (data) => {
  clientId = data.clientId;
  clientIdBadge.textContent = clientId;
  console.log(`Registered as ${clientId}`);
  
  // Request initial stream status
  fetch('/api/stream-info')
    .then(r => r.json())
    .then(info => {
      updateStreamStatusUI(info.status);
    });
});

socket.on('stream_status_change', (data) => {
  updateStreamStatusUI(data);
});

// Periodic HTTP REST Polling Fallback (For serverless environments without persistent WebSockets)
function pollClientStreamStatus() {
  fetch('/api/stream-info')
    .then(r => r.json())
    .then(info => {
      if (info && info.status) {
        updateStreamStatusUI(info.status);
      }
    })
    .catch(() => {});
}
setInterval(pollClientStreamStatus, 4000);
pollClientStreamStatus();

socket.on('stream_terminated', () => {
  console.log('Stream terminated by admin.');
  resetPlayerUI();
  updateStreamStatusUI({ status: 'OFFLINE' });
});

// VTS Source Allocation
function handleSourceAllocation(data) {
  console.log('Source allocated by Virtual Tracker Server:', data);
  currentSourceId = data.sourceId;
  
  // Update Source UI
  activeSourceName.textContent = data.sourceId;
  activeSourceType.textContent = data.sourceType;
  
  // Style Source Type badge
  activeSourceType.className = 'badge';
  if (data.sourceType && data.sourceType.toLowerCase().includes('peer')) {
    activeSourceType.classList.add('green');
  } else if (data.sourceType && data.sourceType.toLowerCase().includes('edge')) {
    activeSourceType.classList.add('blue');
  } else {
    activeSourceType.classList.add('purple');
  }
  
  activeSourceLatency.textContent = `${data.latency || 0} ms`;
  hudSource.textContent = `Source: ${data.sourceId}`;
  
  // Update Timings Metadata
  metaVideoName.textContent = data.videoName;
  metaReqTime.textContent = formatTimestamp(data.requestTime);
  metaAllocTime.textContent = formatTimestamp(data.allocationTime);
  metaVtsTime.textContent = `${data.processingTimeMs || 0} ms`;
  metaStartTime.textContent = formatTimestamp(data.allocationTime);
  metaWorkerThread.textContent = 'Spawning...';

  // Play Master Video with High-Performance Range Streaming
  videoDuration = data.videoDuration || 0;
  serverStreamStartTime = data.streamStartedAt;
  streamStartTime = Date.now();
  
  streamPlayer.src = `/video/${encodeURIComponent(data.videoName)}`;
  streamPlayer.load();
  streamPlayer.classList.remove('hidden');
  videoPlaceholder.classList.add('hidden');
  liveHud.classList.remove('hidden');
  
  // Start Video Playback
  streamPlayer.currentTime = 0;
  const playPromise = streamPlayer.play();
  if (playPromise !== undefined) {
    playPromise.catch(e => {
      console.log('Autoplay policy caught, awaiting user interaction:', e);
    });
  }
  
  // Controls UI
  watchBtn.classList.add('hidden');
  disconnectBtn.classList.remove('hidden');
  
  // Start Timers
  startDurationTimer();
}

socket.on('source_allocated', (data) => {
  handleSourceAllocation(data);
});

// Real-Time Worker Thread Chunk Feed
socket.on('stream_chunk', (data) => {
  if (hudThread && data.threadId) {
    hudThread.textContent = `Worker Thread #${data.threadId}`;
  }
  if (metaWorkerThread && data.threadId) {
    metaWorkerThread.textContent = `Worker Thread #${data.threadId}`;
  }
  if (metaChunkInfo) {
    metaChunkInfo.textContent = `Chunk #${data.chunkIndex} (Hash: ${data.hash || 'e8a1'}, ${data.computeTimeMs}ms CPU)`;
  }
});

// Failover reallocation
socket.on('source_changed', (data) => {
  console.log('VTS Reallocation Failover Event:', data);
  
  const oldSourceId = currentSourceId;
  currentSourceId = data.newSourceId;
  
  // Update HUD and Source Card
  activeSourceName.textContent = data.newSourceId;
  activeSourceType.textContent = data.newSourceType;
  
  activeSourceType.className = 'badge';
  if (data.newSourceType.toLowerCase().includes('peer')) {
    activeSourceType.classList.add('green');
  } else if (data.newSourceType.toLowerCase().includes('edge')) {
    activeSourceType.classList.add('blue');
  } else {
    activeSourceType.classList.add('purple');
  }
  
  activeSourceLatency.textContent = `${data.latency} ms`;
  hudSource.textContent = `Source: ${data.newSourceId}`;
  
  // Flash Failover Banner
  failoverDetails.textContent = `Reallocated from ${oldSourceId} to ${data.newSourceId} (Reason: ${data.reason})`;
  failoverBanner.classList.remove('hidden');
  
  // Log into Reallocation Switch list
  addSwitchHistoryLog(oldSourceId, data.newSourceId, data.reason, data.switchTime);
  
  // Auto-hide banner after 5 seconds
  setTimeout(() => {
    failoverBanner.classList.add('hidden');
  }, 5000);
});

// Stream error handler
socket.on('stream_error', (data) => {
  alert(data.message);
  resetPlayerUI();
});

// Trigger watch request to VTS
watchBtn.addEventListener('click', () => {
  watchBtn.disabled = true;
  watchBtn.textContent = 'Requesting Source...';
  if (socket && socket.emit) {
    try { socket.emit('watch_live'); } catch (e) {}
  }
  fetch('/api/stream/watch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId })
  })
    .then(r => r.json())
    .then(data => {
      if (data.success && data.sourceId) {
        handleSourceAllocation(data);
      } else if (data.error) {
        alert(data.error);
        watchBtn.disabled = false;
        watchBtn.textContent = 'Watch Live';
      }
    })
    .catch(() => {
      watchBtn.disabled = false;
      watchBtn.textContent = 'Watch Live';
    });
});

// Disconnect watch session
disconnectBtn.addEventListener('click', () => {
  if (socket && socket.emit) {
    try { socket.emit('disconnect_stream'); } catch (e) {}
  }
  fetch('/api/stream/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId })
  }).catch(() => {});
  resetPlayerUI();
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function updateStreamStatusUI(stream) {
  if (stream && stream.status === 'LIVE') {
    streamStatusBadge.textContent = '● LIVE';
    streamStatusBadge.className = 'status-indicator live';
    
    if (disconnectBtn.classList.contains('hidden')) {
      watchBtn.disabled = false;
      watchBtn.textContent = 'Watch Live';
    }
  } else {
    streamStatusBadge.textContent = '● OFFLINE';
    streamStatusBadge.className = 'status-indicator offline';
    watchBtn.disabled = true;
    watchBtn.textContent = 'Watch Live';
    resetPlayerUI();
  }
}

function resetPlayerUI() {
  watchBtn.classList.remove('hidden');
  watchBtn.disabled = false;
  watchBtn.textContent = 'Watch Live';
  
  disconnectBtn.classList.add('hidden');
  videoPlaceholder.classList.remove('hidden');
  streamPlayer.classList.add('hidden');
  liveHud.classList.add('hidden');
  
  streamPlayer.pause();
  streamPlayer.removeAttribute('src');
  streamPlayer.load();
  
  placeholderText.textContent = 'Waiting for Stream to Start...';
  
  activeSourceName.textContent = 'NONE';
  activeSourceType.textContent = 'N/A';
  activeSourceType.className = 'badge';
  activeSourceLatency.textContent = '0 ms';
  
  metaVideoName.textContent = '-';
  metaWorkerThread.textContent = '-';
  metaReqTime.textContent = '-';
  metaAllocTime.textContent = '-';
  metaVtsTime.textContent = '-';
  metaStartTime.textContent = '-';
  metaLivePos.textContent = '00:00 / 00:00';
  metaChunkInfo.textContent = '-';
  
  stopDurationTimer();
  durationClock.textContent = '00:00:00';
}

function startDurationTimer() {
  stopDurationTimer();
  durationTimer = setInterval(() => {
    if (!streamStartTime) return;
    const elapsedSecs = Math.floor((Date.now() - streamStartTime) / 1000);
    const hrs = String(Math.floor(elapsedSecs / 3600)).padStart(2, '0');
    const mins = String(Math.floor((elapsedSecs % 3600) / 60)).padStart(2, '0');
    const secs = String(elapsedSecs % 60).padStart(2, '0');
    durationClock.textContent = `${hrs}:${mins}:${secs}`;
  }, 1000);
}

function stopDurationTimer() {
  if (durationTimer) {
    clearInterval(durationTimer);
    durationTimer = null;
  }
}

function addSwitchHistoryLog(oldSrc, newSrc, reason, timestamp) {
  const empty = switchHistoryList.querySelector('.empty-msg');
  if (empty) empty.remove();
  
  const li = document.createElement('li');
  li.innerHTML = `
    <div class="switch-event">
      <strong>${oldSrc} &rarr; ${newSrc}</strong>
      <span>${reason}</span>
    </div>
    <span class="switch-time">${formatTimestamp(timestamp)}</span>
  `;
  switchHistoryList.prepend(li);
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr).toLocaleTimeString();
  } catch (e) {
    return isoStr;
  }
}

function formatDuration(secs) {
  if (isNaN(secs) || secs < 0) return '00:00';
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(Math.floor(secs % 60)).padStart(2, '0');
  return `${m}:${s}`;
}
