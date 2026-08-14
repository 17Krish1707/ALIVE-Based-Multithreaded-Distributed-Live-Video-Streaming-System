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
// TAB SWITCHING LOGIC
// ============================================================
const navLinks = document.querySelectorAll('.sidebar nav ul li');
const tabContents = document.querySelectorAll('.tab-content');

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    const href = link.querySelector('a')?.getAttribute('href');
    if (href && href.startsWith('#')) {
      e.preventDefault();
      navLinks.forEach(l => l.classList.remove('active'));
      tabContents.forEach(t => t.classList.remove('active'));
      
      link.classList.add('active');
      const tabId = href.substring(1);
      const targetTab = document.getElementById(tabId);
      if (targetTab) targetTab.classList.add('active');
    }
  });
});

// ============================================================
// BACKEND URL RESOLUTION & SOCKET.IO INITIALIZATION
// ============================================================
function getBackendUrl() {
  if (typeof window !== 'undefined') {
    if (window.ALIVE_BACKEND_URL) return window.ALIVE_BACKEND_URL;
    const stored = localStorage.getItem('alive_backend_url');
    if (stored) return stored;
    return window.location.origin;
  }
  return '';
}

function apiUrl(path) {
  const base = getBackendUrl();
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

const BACKEND_URL = getBackendUrl();
const socket = typeof io !== 'undefined'
  ? io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    })
  : { on: () => {}, emit: () => {} };

// Elements
const globalStatus = document.getElementById('global-status-indicator');
const globalStreamTime = document.getElementById('global-stream-time');

// Upload Elements
const fileInput = document.getElementById('video-file-input');
const uploadZone = document.getElementById('upload-zone');
const uploadLabel = document.getElementById('upload-label');
const progressBarContainer = document.getElementById('upload-progress-container');
const progressBar = document.getElementById('upload-progress-bar');
const uploadStatusText = document.getElementById('upload-status-text');
const uploadPercentText = document.getElementById('upload-percent-text');

const videoDetailsCard = document.getElementById('video-details-card');
const metaFilename = document.getElementById('meta-filename');
const metaSize = document.getElementById('meta-size');
const metaDuration = document.getElementById('meta-duration');
const metaTimestamp = document.getElementById('meta-timestamp');
const metaFileType = document.getElementById('meta-filetype');
const metaStatus = document.getElementById('meta-status');

// Stream Controls Elements
const startStreamBtn = document.getElementById('start-stream-btn');
const stopStreamBtn = document.getElementById('stop-stream-btn');
const lblActiveVideo = document.getElementById('lbl-active-video');
const lblStartTime = document.getElementById('lbl-start-time');
const lblElapsed = document.getElementById('lbl-elapsed');

// Performance Metrics Elements
const mTotalClients = document.getElementById('metric-total-clients');
const mActiveClients = document.getElementById('metric-active-clients');
const mAvgVts = document.getElementById('metric-avg-vts');
const mSwitches = document.getElementById('metric-switches');

// Multithreading HUD Elements
const mtMainStatus = document.getElementById('mt-main-status');
const mtActiveWorkers = document.getElementById('mt-active-workers');
const mtTotalCreated = document.getElementById('mt-total-created');
const mtCompletedWorkers = document.getElementById('mt-completed-workers');
const mtFailedWorkers = document.getElementById('mt-failed-workers');
const mtAvgExec = document.getElementById('mt-avg-exec');
const mtLongestExec = document.getElementById('mt-longest-exec');

// Console Log Element
const consoleLogs = document.getElementById('console-logs');

// Sources, Tables, Workers, History Lists
const sourcesContainer = document.getElementById('sources-container');
const clientTableBody = document.getElementById('client-table-body');
const threadsContainer = document.getElementById('threads-container');
const allocationHistoryList = document.getElementById('allocation-history-list');

// Deadlock Elements
const dlBtnUnsafe = document.getElementById('dl-btn-unsafe');
const dlBtnSafeOrder = document.getElementById('dl-btn-safe-order');
const dlBtnSafeTimeout = document.getElementById('dl-btn-safe-timeout');
const dlBtnReset = document.getElementById('dl-btn-reset');
const dlWarning = document.getElementById('deadlock-warning');

const dlW1Card = document.getElementById('dl-w1-card');
const dlW2Card = document.getElementById('dl-w2-card');
const dlW1Status = document.getElementById('dl-w1-status');
const dlW2Status = document.getElementById('dl-w2-status');
const dlW1Holds = document.getElementById('dl-w1-holds');
const dlW2Holds = document.getElementById('dl-w2-holds');
const dlW1Waits = document.getElementById('dl-w1-waits');
const dlW2Waits = document.getElementById('dl-w2-waits');

const dlResPeer1 = document.getElementById('dl-res-peer1');
const dlResEdge1 = document.getElementById('dl-res-edge1');
const dlResPeer1Lock = document.getElementById('dl-res-peer1-lock');
const dlResEdge1Lock = document.getElementById('dl-res-edge1-lock');

// State Variables
let uploadedVideo = null;
let sourcesState = [];
let clientsState = [];
let activeStream = null;
let streamElapsedTimer = null;
let canvasAnimId = null;

// ============================================================
// SOCKET REGISTER & INIT
// ============================================================

socket.on('connect', () => {
  console.log('[SOCKET] Admin connected to backend:', BACKEND_URL, 'Socket ID:', socket.id);
  socket.emit('admin_register');
});

socket.on('connect_error', (err) => {
  console.warn('[SOCKET] Real-time connection notice:', err.message, 'Target:', BACKEND_URL);
});

socket.on('disconnect', (reason) => {
  console.log('[SOCKET] Disconnected:', reason);
});

socket.on('admin_init', (data) => {
  console.log('Received admin initialization payload:', data);
  
  sourcesState = data.sources;
  updateSourcesUI(sourcesState);
  updateMetricsUI(data.metrics);
  if (data.threadMetrics) {
    updateMultithreadingMetricsUI(data.threadMetrics);
  }
  
  // Console logs
  consoleLogs.innerHTML = '';
  data.logs.forEach(log => {
    appendLog(log);
  });

  // History and switches
  updateAllocationHistoryUI(data.history);
  updateClientTableUI(data.sessions);
  if (data.threads) {
    updateThreadsUI(data.threads);
  }
  
  // Stream state
  updateStreamControlUI(data.status);
});

// Periodic HTTP REST Polling
function pollStreamInfo() {
  fetch(apiUrl('/api/stream-info'))
    .then(r => r.json())
    .then(data => {
      if (data.sources) updateSourcesUI(data.sources);
      if (data.metrics) updateMetricsUI(data.metrics);
      if (data.threadMetrics) updateMultithreadingMetricsUI(data.threadMetrics);
      if (data.status) updateStreamControlUI(data.status);
    })
    .catch(() => {});
}
setInterval(pollStreamInfo, 4000);
pollStreamInfo();

// Real-time Event Handlers
socket.on('log_event', (logStr) => {
  appendLog(logStr);
});

socket.on('metrics_update', (metrics) => {
  updateMetricsUI(metrics);
});

socket.on('thread_metrics_update', (metrics) => {
  updateMultithreadingMetricsUI(metrics);
});

socket.on('source_update', (sources) => {
  sourcesState = sources;
  updateSourcesUI(sources);
});

socket.on('client_list_update', (sessions) => {
  clientsState = sessions;
  updateClientTableUI(sessions);
});

socket.on('history_update', (history) => {
  updateAllocationHistoryUI(history);
});

socket.on('thread_list_update', (threads) => {
  updateThreadsUI(threads);
});

socket.on('stream_status_change', (stream) => {
  updateStreamControlUI(stream);
});

// ============================================================
// 1 GB VIDEO RESOURCE UPLOAD (Real Streamed Upload & Progress)
// ============================================================

uploadZone.addEventListener('click', () => {
  fileInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleUpload(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleUpload(file);
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function handleUpload(file) {
  if (!file.name.toLowerCase().endsWith('.mp4')) {
    alert('Only MP4 video files (.mp4) are accepted.');
    return;
  }

  // 1 GB Client-Side Size Check
  const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
  if (file.size > MAX_BYTES) {
    alert(`File size (${formatBytes(file.size)}) exceeds the maximum allowed limit of 1 GB.`);
    return;
  }

  // Vercel Serverless Function 4.5 MB Payload Limit Check
  const isVercel = window.location.hostname.includes('vercel.app');
  const VERCEL_MAX_PAYLOAD = 4.5 * 1024 * 1024; // 4.5 MB
  if (isVercel && file.size > VERCEL_MAX_PAYLOAD) {
    alert(`[Vercel Deployment Notice]\nVercel Serverless Functions limit file uploads to 4.5 MB (Selected file: ${formatBytes(file.size)}).\n\nRegistering video metadata fallback automatically. For full 1 GB video uploads, WebSockets, and multithreaded streaming, deploy to a Node server host like Render or Railway.`);
  }

  let handled = false;
  const triggerSend = (dur) => {
    if (handled) return;
    handled = true;
    if (isVercel && file.size > VERCEL_MAX_PAYLOAD) {
      fallbackRegister(file, dur);
    } else {
      sendUpload(file, dur);
    }
  };

  // Read exact duration from video metadata in browser with fallback timer
  const tempVideo = document.createElement('video');
  tempVideo.preload = 'metadata';
  const objectUrl = URL.createObjectURL(file);
  tempVideo.src = objectUrl;

  const timeoutTimer = setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
    triggerSend(0);
  }, 2000);

  tempVideo.onloadedmetadata = () => {
    clearTimeout(timeoutTimer);
    URL.revokeObjectURL(objectUrl);
    const exactDuration = Math.round(tempVideo.duration) || 0;
    triggerSend(exactDuration);
  };

  tempVideo.onerror = () => {
    clearTimeout(timeoutTimer);
    URL.revokeObjectURL(objectUrl);
    triggerSend(0);
  };
}

function sendUpload(file, exactDuration) {
  const formData = new FormData();
  formData.append('video', file);
  if (exactDuration > 0) {
    formData.append('duration', exactDuration);
  }

  // Show progress container
  uploadLabel.classList.add('hidden');
  progressBarContainer.classList.remove('hidden');
  videoDetailsCard.classList.add('hidden');
  progressBar.style.width = '0%';
  uploadPercentText.textContent = '0%';
  uploadStatusText.textContent = 'Uploading... 0%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', apiUrl('/api/upload'), true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = `${pct}%`;
      uploadPercentText.textContent = `${pct}%`;
      uploadStatusText.textContent = `Uploading... ${pct}% (${formatBytes(e.loaded)} / ${formatBytes(e.total)})`;
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      try {
        const res = JSON.parse(xhr.responseText);
        handleSuccessfulUploadResponse(res);
      } catch (e) {
        fallbackRegister(file, exactDuration);
      }
    } else if (xhr.status === 413) {
      console.warn('Payload too large (413). Vercel serverless functions limit request bodies to 4.5 MB. Falling back to serverless registration...');
      alert(`Upload notice: Server returned 413 Payload Too Large (Vercel Serverless Function 4.5 MB limit).\nFalling back to video metadata registration...`);
      fallbackRegister(file, exactDuration);
    } else {
      console.warn(`Upload endpoint returned status ${xhr.status}. Falling back to registration...`);
      fallbackRegister(file, exactDuration);
    }
  };

  xhr.onerror = () => {
    console.warn('Binary upload connection error. Falling back to registration...');
    fallbackRegister(file, exactDuration);
  };

  xhr.send(formData);
}

function handleSuccessfulUploadResponse(res) {
  uploadedVideo = res.video;
  console.log('Video resource registered successfully:', res);
  uploadStatusText.textContent = 'Upload complete';
  progressBar.style.width = '100%';
  uploadPercentText.textContent = '100%';
  
  // Update Detailed UI Metadata
  metaFilename.textContent = res.video.name;
  metaSize.textContent = res.video.sizeFormatted || formatBytes(res.video.size);
  
  const mins = String(Math.floor(res.video.duration / 60)).padStart(2, '0');
  const secs = String(Math.floor(res.video.duration % 60)).padStart(2, '0');
  metaDuration.textContent = `${mins}:${secs} (${Math.round(res.video.duration)} seconds)`;
  
  metaTimestamp.textContent = new Date(res.video.uploadTimestamp || Date.now()).toLocaleString();
  metaFileType.textContent = res.video.fileType || 'video/mp4';
  metaStatus.textContent = res.video.status || 'Upload complete';
  metaStatus.className = 'badge green';

  setTimeout(() => {
    progressBarContainer.classList.add('hidden');
    videoDetailsCard.classList.remove('hidden');
  }, 500);

  // Enable Stream Start and persist state
  startStreamBtn.disabled = false;
  lblActiveVideo.textContent = res.video.name;
}

function fallbackRegister(file, exactDuration) {
  fetch(apiUrl('/api/register-video'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      duration: exactDuration || 300
    })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      handleSuccessfulUploadResponse(res);
    } else {
      alert('Upload failed: ' + (res.error || 'Unknown error'));
      resetUploadZone();
    }
  })
  .catch(err => {
    alert('Upload error: ' + err.message);
    resetUploadZone();
  });
}

function resetUploadZone() {
  uploadLabel.classList.remove('hidden');
  progressBarContainer.classList.add('hidden');
  videoDetailsCard.classList.add('hidden');
  if (!uploadedVideo) {
    startStreamBtn.disabled = true;
  }
}

// ============================================================
// STREAM PLAYBACK CONTROLS
// ============================================================

startStreamBtn.addEventListener('click', () => {
  startStreamBtn.disabled = true;
  if (socket && socket.emit) {
    try { socket.emit('toggle_stream', { action: 'START' }); } catch (e) {}
  }
  fetch(apiUrl('/api/stream/start'), { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      startStreamBtn.disabled = false;
      if (data.success && data.stream) {
        updateStreamControlUI(data.stream);
      } else if (data.error) {
        alert(data.error);
      }
    })
    .catch(() => {
      startStreamBtn.disabled = false;
    });
});

stopStreamBtn.addEventListener('click', () => {
  stopStreamBtn.disabled = true;
  if (socket && socket.emit) {
    try { socket.emit('toggle_stream', { action: 'STOP' }); } catch (e) {}
  }
  fetch(apiUrl('/api/stream/stop'), { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      stopStreamBtn.disabled = false;
      if (data.success) {
        updateStreamControlUI({ status: 'OFFLINE' });
      }
    })
    .catch(() => {
      stopStreamBtn.disabled = false;
    });
});

function updateStreamControlUI(stream) {
  activeStream = stream;
  
  if (stream && stream.status === 'LIVE') {
    globalStatus.textContent = '● LIVE';
    globalStatus.className = 'status-indicator live';
    
    startStreamBtn.classList.add('hidden');
    stopStreamBtn.classList.remove('hidden');
    
    const activeName = stream.filename || (uploadedVideo && uploadedVideo.name) || 'Live Broadcast';
    lblActiveVideo.textContent = activeName;
    lblStartTime.textContent = stream.started_at ? new Date(stream.started_at).toLocaleTimeString() : new Date().toLocaleTimeString();
    
    uploadZone.style.pointerEvents = 'none';
    uploadZone.style.opacity = '0.55';
    
    if (stream.started_at) {
      startStreamElapsedTimer(stream.started_at);
    }
  } else {
    globalStatus.textContent = '● OFFLINE';
    globalStatus.className = 'status-indicator offline';
    globalStreamTime.textContent = '00:00:00';
    
    startStreamBtn.classList.remove('hidden');
    stopStreamBtn.classList.add('hidden');
    
    uploadZone.style.pointerEvents = 'auto';
    uploadZone.style.opacity = '1';
    
    lblStartTime.textContent = '-';
    lblElapsed.textContent = '00:00:00';
    
    stopStreamElapsedTimer();
    
    // Check if there is an uploaded video in memory OR reported by backend stream status
    const availableName = (uploadedVideo && uploadedVideo.name) || (stream && stream.filename) || (stream && stream.filepath);
    if (availableName) {
      startStreamBtn.disabled = false;
      lblActiveVideo.textContent = availableName;
    } else {
      startStreamBtn.disabled = true;
      lblActiveVideo.textContent = 'None';
    }
  }
}

function startStreamElapsedTimer(startedAt) {
  stopStreamElapsedTimer();
  const startTs = new Date(startedAt).getTime();
  
  streamElapsedTimer = setInterval(() => {
    const totalSecs = Math.floor((Date.now() - startTs) / 1000);
    const hrs = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSecs % 60).padStart(2, '0');
    
    const formatted = `${hrs}:${mins}:${secs}`;
    globalStreamTime.textContent = formatted;
    lblElapsed.textContent = formatted;
  }, 1000);
}

function stopStreamElapsedTimer() {
  if (streamElapsedTimer) {
    clearInterval(streamElapsedTimer);
    streamElapsedTimer = null;
  }
}

// ============================================================
// DYNAMIC UI UPDATERS
// ============================================================

function appendLog(logStr) {
  const p = document.createElement('p');
  p.textContent = logStr;
  consoleLogs.appendChild(p);
  consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

function updateMetricsUI(metrics) {
  if (!metrics) return;
  mTotalClients.textContent = metrics.totalClients;
  mActiveClients.textContent = metrics.activeClients;
  mAvgVts.textContent = `${metrics.avgProcessingTime} ms`;
  mSwitches.textContent = metrics.sourceSwitches;
}

function updateMultithreadingMetricsUI(mtMetrics) {
  if (!mtMetrics) return;
  mtActiveWorkers.textContent = mtMetrics.activeWorkers;
  mtTotalCreated.textContent = mtMetrics.totalCreated;
  mtCompletedWorkers.textContent = mtMetrics.completed;
  mtFailedWorkers.textContent = mtMetrics.failed;
  mtAvgExec.textContent = `${mtMetrics.avgExecutionTimeMs} ms`;
  
  if (mtMetrics.longestExecutionTimeMs >= 1000) {
    mtLongestExec.textContent = `${(mtMetrics.longestExecutionTimeMs / 1000).toFixed(2)} s`;
  } else {
    mtLongestExec.textContent = `${mtMetrics.longestExecutionTimeMs} ms`;
  }

  if (mtMainStatus) {
    mtMainStatus.textContent = `Main Thread: ${mtMetrics.mainThreadStatus || 'ONLINE'}`;
  }
}

function updateSourcesUI(sources) {
  sourcesContainer.innerHTML = '';
  sources.forEach(source => {
    const div = document.createElement('div');
    div.className = `source-node-row ${source.online ? '' : 'offline'}`;
    
    const pct = Math.round((source.connected / source.capacity) * 100);
    const badgeClass = pct >= 100 ? 'badge red' : pct > 0 ? 'badge yellow' : 'badge green';
    const statusText = !source.online ? '● OFFLINE' : pct >= 100 ? '● BUSY' : '● AVAILABLE';

    div.innerHTML = `
      <div class="source-name-type">
        <h4>${source.name} <span>(${source.type})</span></h4>
        <span class="${badgeClass}">${statusText}</span>
      </div>
      <div class="source-load-details">
        <div class="load-item">
          <span class="lbl">Latency</span>
          <span class="val">${source.latency} ms</span>
        </div>
        <div class="load-item">
          <span class="lbl">Clients</span>
          <span class="val">${source.connected} / ${source.capacity}</span>
        </div>
        <div class="load-item">
          <span class="lbl">Total Requests</span>
          <span class="val">${source.totalRequests}</span>
        </div>
        <div class="load-item">
          <span class="lbl">Action</span>
          <span class="val"><button class="btn btn-grey btn-toggle-source" style="padding: 4px 8px; font-size:0.75rem;" onclick="toggleSource('${source.id}')">${source.online ? 'Disable' : 'Enable'}</button></span>
        </div>
      </div>
    `;
    sourcesContainer.appendChild(div);
  });
}

window.toggleSource = function(sourceId) {
  socket.emit('toggle_source_online', { sourceId });
};

function updateClientTableUI(sessions) {
  clientTableBody.innerHTML = '';
  
  const activeSessions = sessions.filter(s => ['CONNECTED', 'REQUESTING', 'ALLOCATED', 'STREAMING'].includes(s.status));
  
  if (activeSessions.length === 0) {
    clientTableBody.innerHTML = '<tr><td colspan="8" class="text-center font-italic text-muted">No active streaming sessions.</td></tr>';
    return;
  }

  activeSessions.forEach(session => {
    const tr = document.createElement('tr');
    
    let durationText = '-';
    if (session.stream_start_time) {
      const elapsed = Math.floor((Date.now() - new Date(session.stream_start_time).getTime()) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      durationText = `${mins}:${secs}`;
    }

    const source = session.current_source || '-';
    const lat = session.current_source ? sourcesState.find(s => s.id === session.current_source)?.latency + ' ms' : '-';
    const start = session.stream_start_time ? new Date(session.stream_start_time).toTimeString().split(' ')[0] : '-';
    const req = session.request_time ? new Date(session.request_time).toTimeString().split(' ')[0] : '-';
    
    let statusClass = 'badge grey';
    if (session.status === 'STREAMING') statusClass = 'badge green';
    else if (session.status === 'REQUESTING') statusClass = 'badge yellow';
    else if (session.status === 'FAILED') statusClass = 'badge red';

    tr.innerHTML = `
      <td class="font-semibold">${session.client_id}</td>
      <td>${session.browser} / ${session.ip_address}</td>
      <td>${req}</td>
      <td><strong>${source}</strong></td>
      <td>${lat}</td>
      <td>${start}</td>
      <td>${durationText}</td>
      <td><span class="${statusClass}">${session.status}</span></td>
    `;
    clientTableBody.appendChild(tr);
  });
}

// Visual Worker Thread Concurrency Pipeline Renderer
function updateThreadsUI(threads) {
  threadsContainer.innerHTML = '';
  if (!threads || threads.length === 0) {
    threadsContainer.innerHTML = '<div class="empty-state text-muted font-italic">No active concurrent worker threads.</div>';
    return;
  }

  threads.forEach(thread => {
    const div = document.createElement('div');
    div.className = 'thread-pipeline-card';
    
    const chunkPct = thread.totalChunks ? Math.round((thread.currentChunk / thread.totalChunks) * 100) : 0;
    
    div.innerHTML = `
      <div class="pipeline-header">
        <div class="client-title">
          <span class="badge purple">Client: ${thread.clientId}</span>
          <span class="thread-id-pill">Worker Thread #${thread.threadId}</span>
        </div>
        <span class="badge blue">${thread.status}</span>
      </div>

      <div class="pipeline-flow">
        <div class="flow-step">
          <span class="step-label">CLIENT</span>
          <strong>${thread.clientId}</strong>
        </div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step highlight">
          <span class="step-label">THREAD</span>
          <strong>Thread #${thread.threadId}</strong>
        </div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step">
          <span class="step-label">SOURCE</span>
          <strong>${thread.sourceId}</strong>
        </div>
      </div>

      <div class="pipeline-metrics">
        <div class="pm-item">
          <span>Chunk:</span>
          <strong>${thread.currentChunk}/${thread.totalChunks} (${chunkPct}%)</strong>
        </div>
        <div class="pm-item">
          <span>CPU Compute:</span>
          <strong>${thread.lastComputeMs || 1.2} ms</strong>
        </div>
        <div class="pm-item">
          <span>Runtime:</span>
          <strong>${thread.runtimeSecs || 0}s</strong>
        </div>
      </div>
    `;
    threadsContainer.appendChild(div);
  });
}

function updateAllocationHistoryUI(history) {
  allocationHistoryList.innerHTML = '';
  const filtered = history.filter(h => h.released_at !== null);
  
  if (filtered.length === 0) {
    allocationHistoryList.innerHTML = '<li class="empty-msg text-muted font-italic">No historical allocations recorded.</li>';
    return;
  }

  filtered.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="detail">
        <strong>${item.client_id} &rarr; ${item.source_id}</strong>
        <span>Released: ${new Date(item.released_at).toLocaleTimeString()}</span>
      </div>
      <div style="text-align: right;">
        <div class="badge grey">${item.source_type}</div>
        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">Dur: ${item.duration_seconds}s</div>
      </div>
    `;
    allocationHistoryList.appendChild(li);
  });
}

// ============================================================
// THEME-AWARE TOPOLOGY CANVAS RENDER
// ============================================================
const canvas = document.getElementById('topology-canvas');
const ctx = canvas.getContext('2d');

const nodes = {
  vts: { x: 275, y: 55, label: 'Tracker Server', type: 'SERVER', color: '#6366f1' },
  sources: {
    'Peer-1': { x: 100, y: 165, label: 'Peer-1', type: 'P2P', color: '#10b981' },
    'Peer-2': { x: 215, y: 165, label: 'Peer-2', type: 'P2P', color: '#10b981' },
    'Edge-1': { x: 335, y: 165, label: 'Edge-1', type: 'EDGE', color: '#06b6d4' },
    'CDN-1': { x: 450, y: 165, label: 'CDN-1', type: 'CDN', color: '#a855f7' }
  }
};

let pulses = [];

function drawTopology() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  // 1. Draw logical background links (VTS -> Sources)
  ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  Object.values(nodes.sources).forEach(src => {
    ctx.beginPath();
    ctx.moveTo(nodes.vts.x, nodes.vts.y);
    ctx.lineTo(src.x, src.y);
    ctx.stroke();
  });

  const activeClients = clientsState.filter(s => s.status === 'STREAMING' && s.current_source);
  
  // 2. Draw Client nodes at the bottom dynamically
  const clientNodes = {};
  if (activeClients.length > 0) {
    const segmentWidth = canvas.width / (activeClients.length + 1);
    activeClients.forEach((client, idx) => {
      const x = segmentWidth * (idx + 1);
      const y = 295;
      clientNodes[client.client_id] = { x, y, label: client.client_id, sourceId: client.current_source };
    });
  }

  // 3. Draw active links (Source -> Client) with animated pulses
  ctx.lineWidth = 3;
  Object.values(clientNodes).forEach(node => {
    const srcNode = nodes.sources[node.sourceId];
    if (srcNode) {
      ctx.strokeStyle = isLight ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.3)';
      ctx.beginPath();
      ctx.moveTo(srcNode.x, srcNode.y);
      ctx.lineTo(node.x, node.y);
      ctx.stroke();

      if (!pulses.find(p => p.client === node.label)) {
        pulses.push({ client: node.label, source: node.sourceId, progress: 0 });
      }
    }
  });

  pulses = pulses.filter(p => clientNodes[p.client] && clientNodes[p.client].sourceId === p.source);

  // Draw pulses
  pulses.forEach(p => {
    const src = nodes.sources[p.source];
    const cli = clientNodes[p.client];
    if (src && cli) {
      p.progress += 0.018;
      if (p.progress > 1) p.progress = 0;

      const px = src.x + (cli.x - src.x) * p.progress;
      const py = src.y + (cli.y - src.y) * p.progress;

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  });

  // 4. Draw VTS Node
  drawNode(nodes.vts.x, nodes.vts.y, nodes.vts.label, nodes.vts.color, 24, isLight);

  // 5. Draw Sources Nodes
  Object.keys(nodes.sources).forEach(key => {
    const src = nodes.sources[key];
    const srcState = sourcesState.find(s => s.id === key);
    const color = srcState && !srcState.online ? '#9ca3af' : src.color;
    const label = `${src.label}\n(${srcState ? srcState.connected : 0}/${srcState ? srcState.capacity : 0})`;
    
    drawNode(src.x, src.y, label, color, 20, isLight);
  });

  // 6. Draw Client Nodes
  Object.values(clientNodes).forEach(node => {
    drawNode(node.x, node.y, node.label, '#ef4444', 18, isLight);
  });

  canvasAnimId = requestAnimationFrame(drawTopology);
}

function drawNode(x, y, text, color, radius, isLight) {
  ctx.fillStyle = isLight ? '#ffffff' : 'rgba(20, 22, 37, 0.95)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isLight ? '#0f172a' : '#f3f4f6';
  ctx.font = 'bold 9px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const lines = text.split('\n');
  if (lines.length === 1) {
    ctx.fillText(text, x, y);
  } else {
    ctx.fillText(lines[0], x, y - 5);
    ctx.font = '8px Outfit, sans-serif';
    ctx.fillStyle = isLight ? '#475569' : '#9ca3af';
    ctx.fillText(lines[1], x, y + 6);
  }
}

// Start Topology Animation
drawTopology();

// ============================================================
// DEADLOCK DEMO HUD
// ============================================================

dlBtnUnsafe.addEventListener('click', () => {
  socket.emit('deadlock_trigger_unsafe');
});

dlBtnSafeOrder.addEventListener('click', () => {
  socket.emit('deadlock_trigger_safe_ordering');
});

dlBtnSafeTimeout.addEventListener('click', () => {
  socket.emit('deadlock_trigger_safe_timeout');
});

dlBtnReset.addEventListener('click', () => {
  socket.emit('deadlock_reset');
});

socket.on('deadlock_status', (workers) => {
  dlWarning.classList.add('hidden');
  resetDeadlockVisuals();
  
  if (Object.keys(workers).length === 0) return;

  const w1 = workers['Worker-1'];
  const w2 = workers['Worker-2'];

  if (w1) {
    dlW1Status.textContent = w1.state;
    dlW1Status.className = `badge ${w1.state.includes('LOCKING') ? 'green' : w1.state.includes('WAITING') ? 'yellow' : w1.state.includes('TIMEOUT') ? 'purple' : 'grey'}`;
    dlW1Holds.textContent = w1.holds || '-';
    dlW1Waits.textContent = w1.waitsFor || '-';
    
    if (w1.holds === 'Peer-1') {
      dlResPeer1.classList.add('held');
      dlResPeer1Lock.textContent = 'LOCKED W1';
      dlResPeer1Lock.className = 'badge yellow';
    }
  }

  if (w2) {
    dlW2Status.textContent = w2.state;
    dlW2Status.className = `badge ${w2.state.includes('LOCKING') ? 'green' : w2.state.includes('WAITING') ? 'yellow' : w2.state.includes('TIMEOUT') ? 'purple' : 'grey'}`;
    dlW2Holds.textContent = w2.holds || '-';
    dlW2Waits.textContent = w2.waitsFor || '-';
    
    if (w2.holds === 'Edge-1') {
      dlResEdge1.classList.add('held');
      dlResEdge1Lock.textContent = 'LOCKED W2';
      dlResEdge1Lock.className = 'badge yellow';
    }
  }

  if (w1 && w1.holds && w1.holds.includes('&')) {
    dlResPeer1.classList.add('held');
    dlResPeer1Lock.textContent = 'LOCKED W1';
    dlResPeer1Lock.className = 'badge yellow';
    dlResEdge1.classList.add('held');
    dlResEdge1Lock.textContent = 'LOCKED W1';
    dlResEdge1Lock.className = 'badge yellow';
  }
  
  if (w2 && w2.holds && w2.holds.includes('&')) {
    dlResPeer1.classList.add('held');
    dlResPeer1Lock.textContent = 'LOCKED W2';
    dlResPeer1Lock.className = 'badge yellow';
    dlResEdge1.classList.add('held');
    dlResEdge1Lock.textContent = 'LOCKED W2';
    dlResEdge1Lock.className = 'badge yellow';
  }
});

socket.on('deadlock_detected', () => {
  dlWarning.classList.remove('hidden');
  
  dlW1Status.textContent = 'DEADLOCKED';
  dlW1Status.className = 'badge red';
  dlW2Status.textContent = 'DEADLOCKED';
  dlW2Status.className = 'badge red';
  
  dlW1Card.style.borderColor = 'var(--danger)';
  dlW2Card.style.borderColor = 'var(--danger)';
});

function resetDeadlockVisuals() {
  dlW1Card.style.borderColor = 'var(--border-color)';
  dlW2Card.style.borderColor = 'var(--border-color)';
  
  dlW1Status.textContent = 'Idle';
  dlW1Status.className = 'badge grey';
  dlW2Status.textContent = 'Idle';
  dlW2Status.className = 'badge grey';
  
  dlW1Holds.textContent = '-';
  dlW2Holds.textContent = '-';
  dlW1Waits.textContent = '-';
  dlW2Waits.textContent = '-';
  
  dlResPeer1.classList.remove('held');
  dlResEdge1.classList.remove('held');
  
  dlResPeer1Lock.textContent = 'FREE';
  dlResPeer1Lock.className = 'badge green';
  dlResEdge1Lock.textContent = 'FREE';
  dlResEdge1Lock.className = 'badge green';
}
