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
// TAB SWITCHING & DEEP ROUTE LOGIC
// ============================================================
const navLinks = document.querySelectorAll('.sidebar nav ul li');
const tabContents = document.querySelectorAll('.tab-content');

function activateAdminTab(tabId, updateUrl = true) {
  navLinks.forEach(l => {
    const href = l.querySelector('a')?.getAttribute('href');
    if (href === `#${tabId}`) {
      l.classList.add('active');
    } else {
      l.classList.remove('active');
    }
  });

  tabContents.forEach(t => {
    if (t.id === tabId) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  if (tabId === 'clock-sync') {
    if (typeof drawClockTopology === 'function') {
      try { drawClockTopology(); } catch (e) {}
    }
  } else if (tabId === 'monitoring') {
    if (typeof drawTopology === 'function') {
      try { drawTopology(); } catch (e) {}
    }
  }

  if (updateUrl) {
    if (tabId === 'clock-sync') {
      window.history.replaceState(null, '', '/admin/clock' + window.location.search);
    } else {
      window.history.replaceState(null, '', '/admin#' + tabId);
    }
  }
}

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    const href = link.querySelector('a')?.getAttribute('href');
    if (href && href.startsWith('#')) {
      e.preventDefault();
      const tabId = href.substring(1);
      activateAdminTab(tabId, true);
    }
  });
});

function initRouteOnLoad() {
  const path = window.location.pathname;
  const hash = window.location.hash;
  if (path === '/admin/clock' || path === '/admin/clock/' || hash === '#clock-sync') {
    activateAdminTab('clock-sync', false);
  } else if (hash === '#deadlock-demo') {
    activateAdminTab('deadlock-demo', false);
  } else {
    activateAdminTab('monitoring', false);
  }
}

// ============================================================
// BACKEND URL RESOLUTION & SOCKET.IO INITIALIZATION
// ============================================================
function getBackendUrl() {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return window.location.origin;
    }
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

  // Clock state
  if (data.clock) {
    updateClockState(data.clock);
  }
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

socket.on('clock_log', (logStr) => {
  appendClockLog(logStr);
});

socket.on('clock_state', (state) => {
  updateClockState(state);
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

uploadZone.addEventListener('click', (e) => {
  if (e.target !== fileInput) {
    fileInput.click();
  }
});

fileInput.addEventListener('click', (e) => {
  e.stopPropagation();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null;
  if (file) handleUpload(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files ? e.target.files[0] : null;
  if (file) {
    handleUpload(file);
  }
  fileInput.value = ''; // Reset so selecting the same file triggers change
});

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function handleUpload(file) {
  if (!file) return;

  const validExts = ['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi', '.ts', '.flv'];
  const isVideo = (file.type && file.type.startsWith('video/')) || 
                  validExts.some(ext => file.name.toLowerCase().endsWith(ext));

  if (!isVideo) {
    alert('Please select a valid video file (.mp4, .webm, .mov, etc.).');
    return;
  }

  // 1 GB Client-Side Size Check
  const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
  if (file.size > MAX_BYTES) {
    alert(`File size (${formatBytes(file.size)}) exceeds the maximum allowed limit of 1 GB.`);
    return;
  }

  let handled = false;
  const triggerSend = (dur) => {
    if (handled) return;
    handled = true;
    sendUpload(file, dur);
  };

  // Read exact duration from video metadata in browser with fallback timer
  try {
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    const objectUrl = URL.createObjectURL(file);
    tempVideo.src = objectUrl;

    const timeoutTimer = setTimeout(() => {
      try { URL.revokeObjectURL(objectUrl); } catch (e) {}
      triggerSend(0);
    }, 1500);

    tempVideo.onloadedmetadata = () => {
      clearTimeout(timeoutTimer);
      try { URL.revokeObjectURL(objectUrl); } catch (e) {}
      const exactDuration = Math.round(tempVideo.duration) || 0;
      triggerSend(exactDuration);
    };

    tempVideo.onerror = () => {
      clearTimeout(timeoutTimer);
      try { URL.revokeObjectURL(objectUrl); } catch (e) {}
      triggerSend(0);
    };
  } catch (e) {
    triggerSend(0);
  }
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
  uploadStatusText.textContent = 'Uploading master video... 0%';

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
      console.warn('File exceeds upload limit, falling back to metadata registration...');
      fallbackRegister(file, exactDuration);
    } else {
      console.warn(`Upload endpoint returned status ${xhr.status}. Falling back to metadata registration...`);
      fallbackRegister(file, exactDuration);
    }
  };

  xhr.onerror = () => {
    console.warn('Binary upload network connection error. Falling back to metadata registration...');
    fallbackRegister(file, exactDuration);
  };

  xhr.ontimeout = () => {
    console.warn('Upload timed out. Falling back to metadata registration...');
    fallbackRegister(file, exactDuration);
  };

  try {
    xhr.send(formData);
  } catch (err) {
    console.warn('XHR send error, using registration:', err);
    fallbackRegister(file, exactDuration);
  }
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
  }, 400);

  // Enable Stream Start and persist state
  startStreamBtn.disabled = false;
  lblActiveVideo.textContent = res.video.name;
}

function fallbackRegister(file, exactDuration) {
  uploadStatusText.textContent = 'Registering video resource...';
  progressBar.style.width = '95%';
  uploadPercentText.textContent = '95%';

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
    if (res.success && res.video) {
      handleSuccessfulUploadResponse(res);
    } else {
      alert('Upload failed: ' + (res.error || 'Unknown error'));
      resetUploadZone();
    }
  })
  .catch(err => {
    console.error('Registration error:', err);
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
    clientTableBody.innerHTML = '<tr><td colspan="9" class="text-center font-italic text-muted">No active streaming sessions.</td></tr>';
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
    const lat = session.current_source ? (sourcesState.find(s => s.id === session.current_source)?.latency + ' ms') : '-';
    const start = session.stream_start_time ? new Date(session.stream_start_time).toTimeString().split(' ')[0] : '-';
    const req = session.request_time ? new Date(session.request_time).toTimeString().split(' ')[0] : '-';
    
    let statusClass = 'badge grey';
    if (session.status === 'STREAMING') statusClass = 'badge green';
    else if (session.status === 'REQUESTING') statusClass = 'badge yellow';
    else if (session.status === 'FAILED') statusClass = 'badge red';

    const isStreaming = session.status === 'STREAMING' || session.status === 'REQUESTING';
    const actionHtml = isStreaming 
      ? `<button class="btn btn-danger" style="padding: 4px 10px; font-size: 0.75rem; font-weight:600;" onclick="promptDisconnectClient('${session.client_id}')">Disconnect</button>`
      : `<span class="text-muted" style="font-size:0.75rem;">-</span>`;

    tr.innerHTML = `
      <td class="font-semibold">${session.client_id}</td>
      <td>${session.browser} / ${session.ip_address}</td>
      <td>${req}</td>
      <td><strong>${source}</strong></td>
      <td>${lat}</td>
      <td>${start}</td>
      <td>${durationText}</td>
      <td><span class="${statusClass}">${session.status}</span></td>
      <td>${actionHtml}</td>
    `;
    clientTableBody.appendChild(tr);
  });
}

// Disconnect Modal Elements & Logic
let pendingDisconnectClientId = null;
const disconnectModal = document.getElementById('disconnect-modal');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalTitle = document.getElementById('disconnect-modal-title');
const modalBody = document.getElementById('disconnect-modal-body');

window.promptDisconnectClient = function(clientId) {
  pendingDisconnectClientId = clientId;
  if (modalTitle) modalTitle.textContent = `Disconnect ${clientId}?`;
  if (modalBody) modalBody.textContent = `This will terminate the active streaming session for ${clientId}, kill the dedicated Worker Thread, release source capacity, and record the session as ADMIN_DISCONNECTED.`;
  if (disconnectModal) disconnectModal.classList.remove('hidden');
};

if (modalCancelBtn) {
  modalCancelBtn.addEventListener('click', () => {
    pendingDisconnectClientId = null;
    if (disconnectModal) disconnectModal.classList.add('hidden');
  });
}

if (modalConfirmBtn) {
  modalConfirmBtn.addEventListener('click', () => {
    if (pendingDisconnectClientId) {
      const cid = pendingDisconnectClientId;
      pendingDisconnectClientId = null;
      if (disconnectModal) disconnectModal.classList.add('hidden');

      // Dispatch real server-side disconnect via Socket & REST
      socket.emit('admin_disconnect_client', { clientId: cid });
      fetch(apiUrl(`/api/admin/clients/${encodeURIComponent(cid)}/disconnect`), {
        method: 'POST'
      }).catch(() => {});
    }
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
let canvas = document.getElementById('topology-canvas');
let ctx = canvas ? canvas.getContext('2d') : null;

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
  if (!canvas) canvas = document.getElementById('topology-canvas');
  if (!canvas) return;
  if (!ctx) ctx = canvas.getContext('2d');
  if (!ctx) return;

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

// ============================================================
// CLOCK SYNCHRONIZATION EXPERIMENT ENGINE FRONTEND
// ============================================================

let clockState = {
  nodes: [
    { id: 'VTS', name: 'VTS (Tracker)', type: 'Master Server', offsetMs: 0, status: 'MASTER', role: 'TIME_SERVER / COORDINATOR', lastCorrectionMs: 0 },
    { id: 'Peer-1', name: 'Peer-1', type: 'P2P Peer', offsetMs: 5000, status: 'UNSYNCED', role: 'CLIENT_NODE', lastCorrectionMs: 0 },
    { id: 'Peer-2', name: 'Peer-2', type: 'P2P Peer', offsetMs: -2000, status: 'UNSYNCED', role: 'CLIENT_NODE', lastCorrectionMs: 0 },
    { id: 'Edge-1', name: 'Edge-1', type: 'Edge Server', offsetMs: 3000, status: 'UNSYNCED', role: 'CLIENT_NODE', lastCorrectionMs: 0 },
    { id: 'CDN-1', name: 'CDN-1', type: 'CDN Node', offsetMs: 7000, status: 'UNSYNCED', role: 'CLIENT_NODE', lastCorrectionMs: 0 }
  ],
  lamportClocks: { 'VTS': 0, 'Peer-1': 0, 'Peer-2': 0, 'Edge-1': 0, 'CDN-1': 0 },
  lamportEvents: [],
  activeAlgorithm: 'cristian',
  stepState: { currentStep: 0, totalSteps: 5, completed: false, algorithm: 'cristian' }
};

let clockAnimationPackets = [];
let simDelayMs = 300;

// Clock DOM Elements
const clockNodesTableBody = document.getElementById('clock-nodes-table-body');
const clockActiveAlgoBadge = document.getElementById('clock-active-algo-badge');
const clockStepStatusPill = document.getElementById('clock-step-status-pill');
const clockSpeedSlider = document.getElementById('clock-speed-slider');
const clockSpeedLabel = document.getElementById('clock-speed-label');
const clockConsoleLogs = document.getElementById('clock-console-logs');
const btnClearClockLogs = document.getElementById('btn-clear-clock-logs');

// Controls
const clockBtnRun = document.getElementById('clock-btn-run');
const clockBtnStep = document.getElementById('clock-btn-step');
const clockBtnResetClocks = document.getElementById('clock-btn-reset-clocks');
const clockBtnResetAll = document.getElementById('clock-btn-reset-all');

// Algorithm tabs
const algoTabBtns = document.querySelectorAll('.algo-tab-btn');
const algoWorkspaces = document.querySelectorAll('.algo-workspace');

// Cristian elements
const cristianTargetNode = document.getElementById('cristian-target-node');
const cMathServer = document.getElementById('c-math-server');
const cMathT0 = document.getElementById('c-math-t0');
const cMathTserver = document.getElementById('c-math-tserver');
const cMathT1 = document.getElementById('c-math-t1');
const cMathRtt = document.getElementById('c-math-rtt');
const cMathDelay = document.getElementById('c-math-delay');
const cMathCorrectTime = document.getElementById('c-math-correct-time');
const cMathCorrection = document.getElementById('c-math-correction');
const cristianApplyBtn = document.getElementById('cristian-apply-btn');
const cristianSyncAllBtn = document.getElementById('cristian-sync-all-btn');
const seqClientLabel = document.getElementById('seq-client-label');

// Berkeley elements
const berkeleyPolledTbody = document.getElementById('berkeley-polled-tbody');
const berkeleyAverageVal = document.getElementById('berkeley-average-val');
const berkeleyAdjustmentsGrid = document.getElementById('berkeley-adjustments-grid');
const berkeleyApplyBtn = document.getElementById('berkeley-apply-btn');

// Lamport elements
const lCounterVts = document.getElementById('l-counter-vts');
const lCounterPeer1 = document.getElementById('l-counter-peer1');
const lCounterPeer2 = document.getElementById('l-counter-peer2');
const lCounterEdge1 = document.getElementById('l-counter-edge1');
const lCounterCdn1 = document.getElementById('l-counter-cdn1');
const lamportLocalNode = document.getElementById('lamport-local-node');
const lamportLocalType = document.getElementById('lamport-local-type');
const btnTriggerLocalEvent = document.getElementById('btn-trigger-local-event');
const lamportMsgSender = document.getElementById('lamport-msg-sender');
const lamportMsgReceiver = document.getElementById('lamport-msg-receiver');
const lamportMsgType = document.getElementById('lamport-msg-type');
const btnTriggerMsgEvent = document.getElementById('btn-trigger-msg-event');
const lamportTimelineTbody = document.getElementById('lamport-timeline-tbody');
const lamportTimelineCount = document.getElementById('lamport-timeline-count');

// Helper to format simulated time with milliseconds
function formatClockTime(ms) {
  const d = new Date(ms);
  const hrs = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  const millis = String(d.getMilliseconds()).padStart(3, '0');
  return `${hrs}:${mins}:${secs}.${millis}`;
}

// Continuously tick the displayed times in the Node Clocks table HUD
function tickClockNodesHUD() {
  if (!clockNodesTableBody) return;

  const now = Date.now();
  const rows = clockNodesTableBody.querySelectorAll('tr');

  clockState.nodes.forEach((node, idx) => {
    const timeVal = now + node.offsetMs;
    const formatted = formatClockTime(timeVal);
    const timeCell = document.getElementById(`clock-time-${node.id}`);
    if (timeCell) {
      timeCell.textContent = formatted;
    }
  });
}
setInterval(tickClockNodesHUD, 50);

// Render or update the Node Clocks Live Table rows
function renderClockNodesTable() {
  if (!clockNodesTableBody) return;
  clockNodesTableBody.innerHTML = '';

  const now = Date.now();
  clockState.nodes.forEach(node => {
    const tr = document.createElement('tr');
    
    let offsetClass = 'offset-synced';
    let offsetSign = '+';
    if (node.offsetMs > 0) {
      offsetClass = 'offset-fast';
      offsetSign = '+';
    } else if (node.offsetMs < 0) {
      offsetClass = 'offset-slow';
      offsetSign = '';
    }

    let statusBadge = 'badge grey';
    if (node.status === 'MASTER') statusBadge = 'badge purple';
    else if (node.status === 'SYNCHRONIZED') statusBadge = 'badge green';
    else if (node.status === 'UNSYNCED') statusBadge = 'badge yellow';

    let lastCorrectionText = node.lastCorrectionMs 
      ? `${(node.lastCorrectionMs / 1000).toFixed(3)}s` 
      : '-';

    tr.innerHTML = `
      <td><span class="node-id-badge">${node.id}</span></td>
      <td><span class="badge ${node.id === 'VTS' ? 'purple' : 'grey'}">${node.role || (node.id === 'VTS' ? 'COORDINATOR' : 'NODE')}</span></td>
      <td>${node.type || 'Distributed Node'}</td>
      <td><span class="time-display" id="clock-time-${node.id}">${formatClockTime(now + node.offsetMs)}</span></td>
      <td><strong class="offset-display ${offsetClass}">${offsetSign}${node.offsetMs} ms</strong></td>
      <td><span class="${statusBadge}" id="clock-status-${node.id}">${node.status}</span></td>
      <td><span class="text-secondary">${lastCorrectionText}</span></td>
    `;
    clockNodesTableBody.appendChild(tr);
  });
}

// Initial algorithm resolution from URL param or sessionStorage
function getInitialAlgorithm() {
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrl = urlParams.get('algorithm');
  if (fromUrl && ['cristian', 'berkeley', 'lamport'].includes(fromUrl.toLowerCase())) {
    return fromUrl.toLowerCase();
  }
  const fromSession = sessionStorage.getItem('alive_active_clock_algo');
  if (fromSession && ['cristian', 'berkeley', 'lamport'].includes(fromSession)) {
    return fromSession;
  }
  return 'cristian';
}

let localActiveAlgorithm = getInitialAlgorithm();

// Update clock state from backend payload (NEVER forces activeAlgorithm switch)
function updateClockState(newState) {
  if (!newState) return;
  clockState = newState;

  renderClockNodesTable();

  // Update Cristian calculations if present
  if (newState.lastCristianResult) {
    updateCristianMathUI(newState.lastCristianResult);
  }

  // Update Berkeley calculations if present
  if (newState.lastBerkeleyResult) {
    updateBerkeleyMathUI(newState.lastBerkeleyResult);
  }

  // Update Lamport logical clocks & timeline
  if (newState.lamportClocks) {
    updateLamportCounters(newState.lamportClocks);
  }

  if (newState.lamportEvents) {
    updateLamportTimelineUI(newState.lamportEvents);
  }

  // Update Step status
  if (newState.stepState) {
    updateStepProgressUI(newState.stepState);
  }

  // Populate logs if available
  if (newState.logs && clockConsoleLogs && clockConsoleLogs.childElementCount === 0) {
    newState.logs.forEach(log => appendClockLog(log));
  }
}

// Tab Switching between Cristian, Berkeley, and Lamport (User controlled only)
function selectAlgoTab(algoKey, updateHistory = true) {
  localActiveAlgorithm = algoKey;
  sessionStorage.setItem('alive_active_clock_algo', algoKey);
  clockState.activeAlgorithm = algoKey;

  algoTabBtns.forEach(btn => {
    if (btn.getAttribute('data-algo') === algoKey) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  algoWorkspaces.forEach(ws => {
    if (ws.id === `workspace-${algoKey}`) {
      ws.classList.add('active');
    } else {
      ws.classList.remove('active');
    }
  });

  if (clockActiveAlgoBadge) {
    clockActiveAlgoBadge.textContent = `${algoKey.toUpperCase()}'S ALGORITHM`;
    if (algoKey === 'cristian') clockActiveAlgoBadge.className = 'badge blue';
    else if (algoKey === 'berkeley') clockActiveAlgoBadge.className = 'badge purple';
    else clockActiveAlgoBadge.className = 'badge green';
  }

  if (seqClientLabel && cristianTargetNode) {
    seqClientLabel.textContent = cristianTargetNode.value;
  }

  if (updateHistory && (window.location.pathname.includes('/clock') || window.location.hash === '#clock-sync')) {
    const url = new URL(window.location);
    url.searchParams.set('algorithm', algoKey);
    window.history.replaceState(null, '', url);
  }
}

// Initialize active algorithm tab UI
selectAlgoTab(localActiveAlgorithm, false);

algoTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const algo = btn.getAttribute('data-algo');
    selectAlgoTab(algo, true);
  });
});

if (cristianTargetNode) {
  cristianTargetNode.addEventListener('change', () => {
    if (seqClientLabel) seqClientLabel.textContent = cristianTargetNode.value;
  });
}

// Speed slider
if (clockSpeedSlider && clockSpeedLabel) {
  clockSpeedSlider.addEventListener('input', (e) => {
    simDelayMs = parseInt(e.target.value, 10);
    clockSpeedLabel.textContent = `${simDelayMs} ms`;
  });
}

// ------------------------------------------------------------
// Action Controls & Buttons
// ------------------------------------------------------------

// Run Algorithm
clockBtnRun.addEventListener('click', () => {
  const algo = localActiveAlgorithm;
  if (algo === 'cristian') {
    const target = cristianTargetNode ? cristianTargetNode.value : 'Peer-1';
    spawnClockPacket('VTS', target, 'TIME_REQ');
    socket.emit('clock_cristian_run', { targetNodeId: target });
    fetch(apiUrl('/api/clock/cristian/run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetNodeId: target })
    }).then(r => r.json()).then(data => {
      if (data.result) updateCristianMathUI(data.result);
      if (data.state) updateClockState(data.state);
    }).catch(() => {});
  } else if (algo === 'berkeley') {
    spawnClockPacket('VTS', 'Peer-1', 'POLL');
    spawnClockPacket('VTS', 'Peer-2', 'POLL');
    spawnClockPacket('VTS', 'Edge-1', 'POLL');
    spawnClockPacket('VTS', 'CDN-1', 'POLL');
    socket.emit('clock_berkeley_run');
    fetch(apiUrl('/api/clock/berkeley/run'), {
      method: 'POST'
    }).then(r => r.json()).then(data => {
      if (data.result) updateBerkeleyMathUI(data.result);
      if (data.state) updateClockState(data.state);
    }).catch(() => {});
  } else {
    // Lamport interactive step
    socket.emit('clock_step', { algorithm: 'lamport' });
    fetch(apiUrl('/api/clock/step'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ algorithm: 'lamport' })
    }).then(r => r.json()).then(data => {
      if (data.state) updateClockState(data.state);
    }).catch(() => {});
  }
});

// Step-by-Step
clockBtnStep.addEventListener('click', () => {
  const algo = localActiveAlgorithm;
  socket.emit('clock_step', { algorithm: algo });
  fetch(apiUrl('/api/clock/step'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ algorithm: algo })
  }).then(r => r.json()).then(data => {
    if (data.stepState) updateStepProgressUI(data.stepState);
    if (data.state) updateClockState(data.state);
  }).catch(() => {});
});

// Reset Clocks
clockBtnResetClocks.addEventListener('click', () => {
  socket.emit('clock_reset');
  fetch(apiUrl('/api/clock/reset'), { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      if (data.state) updateClockState(data.state);
    }).catch(() => {});
});

// Reset All
clockBtnResetAll.addEventListener('click', () => {
  socket.emit('clock_reset');
  if (clockConsoleLogs) clockConsoleLogs.innerHTML = '';
  fetch(apiUrl('/api/clock/reset'), { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      if (data.state) updateClockState(data.state);
    }).catch(() => {});
});

// Clear Logs
if (btnClearClockLogs) {
  btnClearClockLogs.addEventListener('click', () => {
    if (clockConsoleLogs) clockConsoleLogs.innerHTML = '';
  });
}

// Synchronize Selected Cristian Node
if (cristianApplyBtn) {
  cristianApplyBtn.addEventListener('click', () => {
    const target = cristianTargetNode ? cristianTargetNode.value : 'Peer-1';
    spawnClockPacket('VTS', target, 'TIME_REQ');
    socket.emit('clock_cristian_run', { targetNodeId: target });
    fetch(apiUrl('/api/clock/cristian/run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetNodeId: target })
    }).then(r => r.json()).then(data => {
      if (data.result) updateCristianMathUI(data.result);
      if (data.state) updateClockState(data.state);
    }).catch(() => {});
  });
}

// Synchronize All Cristian Nodes
if (cristianSyncAllBtn) {
  cristianSyncAllBtn.addEventListener('click', () => {
    ['Peer-1', 'Peer-2', 'Edge-1', 'CDN-1'].forEach(nodeId => {
      spawnClockPacket('VTS', nodeId, 'TIME_REQ');
    });
    socket.emit('clock_cristian_run_all');
    fetch(apiUrl('/api/clock/cristian/run-all'), { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.state) updateClockState(data.state);
      }).catch(() => {});
  });
}

// Distribute Berkeley Adjustments
if (berkeleyApplyBtn) {
  berkeleyApplyBtn.addEventListener('click', () => {
    ['Peer-1', 'Peer-2', 'Edge-1', 'CDN-1'].forEach(nodeId => {
      spawnClockPacket('VTS', nodeId, 'ADJUST');
    });
    socket.emit('clock_berkeley_run');
    fetch(apiUrl('/api/clock/berkeley/run'), { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.result) updateBerkeleyMathUI(data.result);
        if (data.state) updateClockState(data.state);
      }).catch(() => {});
  });
}

// Lamport Local Event Trigger
if (btnTriggerLocalEvent) {
  btnTriggerLocalEvent.addEventListener('click', () => {
    const node = lamportLocalNode ? lamportLocalNode.value : 'Peer-1';
    const type = lamportLocalType ? lamportLocalType.value : 'BUFFER_VIDEO_CHUNK';
    socket.emit('clock_lamport_event', { nodeId: node, eventType: type });
    fetch(apiUrl('/api/clock/lamport/event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: node, eventType: type })
    }).then(r => r.json()).then(data => {
      if (data.state) updateClockState(data.state);
    }).catch(() => {});
  });
}

// Lamport Message Event Trigger
if (btnTriggerMsgEvent) {
  btnTriggerMsgEvent.addEventListener('click', () => {
    const sender = lamportMsgSender ? lamportMsgSender.value : 'Peer-1';
    const receiver = lamportMsgReceiver ? lamportMsgReceiver.value : 'VTS';
    const type = lamportMsgType ? lamportMsgType.value : 'STREAMING_CHUNK';
    
    spawnClockPacket(sender, receiver, `L=${(clockState.lamportClocks[sender] || 0) + 1}`);

    fetch(apiUrl('/api/clock/lamport/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderNodeId: sender, receiverNodeId: receiver, messageType: type })
    }).then(r => r.json()).then(data => {
      if (data.state) updateClockState(data.state);
    }).catch(() => {});
  });
}

// ------------------------------------------------------------
// Mathematical UI Updaters
// ------------------------------------------------------------

function updateCristianMathUI(res) {
  if (!res) return;
  if (cMathServer) cMathServer.textContent = `${res.timeServer || 'VTS'} (Offset 0ms)`;
  if (cMathT0) cMathT0.textContent = formatClockTime(res.t0);
  if (cMathTserver) cMathTserver.textContent = formatClockTime(res.tServer);
  if (cMathT1) cMathT1.textContent = formatClockTime(res.t1);
  if (cMathRtt) cMathRtt.textContent = `${res.rtt} ms`;
  if (cMathDelay) cMathDelay.textContent = `${res.estimatedOneWayDelay} ms`;
  if (cMathCorrectTime) cMathCorrectTime.textContent = formatClockTime(res.estimatedCorrectTime);
  if (cMathCorrection) {
    const sign = res.correctionMs >= 0 ? '+' : '';
    cMathCorrection.textContent = `${sign}${res.correctionSec || (res.correctionMs / 1000).toFixed(3)} s (${sign}${res.correctionMs} ms)`;
  }
}

function updateBerkeleyMathUI(res) {
  if (!res) return;
  if (berkeleyAverageVal) {
    berkeleyAverageVal.textContent = res.averageFormatted || formatClockTime(res.averageTime);
  }

  // Polled table
  if (berkeleyPolledTbody && res.polledClocks) {
    berkeleyPolledTbody.innerHTML = '';
    Object.values(res.polledClocks).forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${item.nodeId}</strong></td>
        <td><code>${item.timeFormatted || formatClockTime(item.time)}</code></td>
        <td><span class="badge ${item.offsetMs > 0 ? 'yellow' : item.offsetMs < 0 ? 'yellow' : 'green'}">${item.offsetMs >= 0 ? '+' : ''}${item.offsetMs} ms</span></td>
      `;
      berkeleyPolledTbody.appendChild(tr);
    });
  }

  // Adjustments grid
  if (berkeleyAdjustmentsGrid && res.adjustments) {
    berkeleyAdjustmentsGrid.innerHTML = '';
    Object.values(res.adjustments).forEach(item => {
      const div = document.createElement('div');
      div.className = 'adj-item';
      const sign = item.adjustmentMs >= 0 ? '+' : '';
      div.innerHTML = `
        <span class="text-secondary">${item.nodeId}</span>
        <strong class="${item.adjustmentMs === 0 ? 'text-success' : 'text-primary'}">${sign}${item.adjustmentSec || (item.adjustmentMs/1000).toFixed(3)}s</strong>
        <span style="font-size:0.7rem; color:var(--text-muted);">${sign}${item.adjustmentMs} ms</span>
      `;
      berkeleyAdjustmentsGrid.appendChild(div);
    });
  }
}

function updateLamportCounters(counters) {
  if (!counters) return;
  if (lCounterVts) lCounterVts.textContent = `L = ${counters['VTS'] || 0}`;
  if (lCounterPeer1) lCounterPeer1.textContent = `L = ${counters['Peer-1'] || 0}`;
  if (lCounterPeer2) lCounterPeer2.textContent = `L = ${counters['Peer-2'] || 0}`;
  if (lCounterEdge1) lCounterEdge1.textContent = `L = ${counters['Edge-1'] || 0}`;
  if (lCounterCdn1) lCounterCdn1.textContent = `L = ${counters['CDN-1'] || 0}`;
}

function updateLamportTimelineUI(events) {
  if (!lamportTimelineTbody) return;
  if (!events || events.length === 0) {
    lamportTimelineTbody.innerHTML = '<tr><td colspan="6" class="text-muted font-italic text-center">No distributed events recorded yet.</td></tr>';
    if (lamportTimelineCount) lamportTimelineCount.textContent = '0 Events';
    return;
  }

  if (lamportTimelineCount) lamportTimelineCount.textContent = `${events.length} Events`;
  lamportTimelineTbody.innerHTML = '';

  events.slice(0, 25).forEach(ev => {
    const tr = document.createElement('tr');
    let catBadge = 'badge blue';
    if (ev.category === 'MESSAGE_SEND') catBadge = 'badge yellow';
    else if (ev.category === 'MESSAGE_RECEIVE') catBadge = 'badge green';
    else if (ev.category === 'LOCAL_EVENT') catBadge = 'badge purple';

    const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '-';

    tr.innerHTML = `
      <td>#${ev.id || 1}</td>
      <td><strong>${ev.nodeId}</strong></td>
      <td><code>${ev.eventType}</code></td>
      <td><span class="${catBadge}">${ev.category || 'EVENT'}</span></td>
      <td><strong class="text-primary" style="font-size:1.1rem; font-family:'Courier New', monospace;">L = ${ev.lamportTime}</strong></td>
      <td><span class="text-muted">${ts}</span></td>
    `;
    lamportTimelineTbody.appendChild(tr);
  });
}

function updateStepProgressUI(stepState) {
  if (!clockStepStatusPill || !stepState) return;
  if (stepState.currentStep === 0) {
    clockStepStatusPill.textContent = 'Ready to Execute';
    clockStepStatusPill.className = 'badge blue';
  } else if (stepState.completed) {
    clockStepStatusPill.textContent = `Step ${stepState.currentStep}/${stepState.totalSteps} (COMPLETED)`;
    clockStepStatusPill.className = 'badge green';
  } else {
    clockStepStatusPill.textContent = `Step ${stepState.currentStep}/${stepState.totalSteps} in Progress`;
    clockStepStatusPill.className = 'badge yellow';
  }
}

function appendClockLog(logStr) {
  if (!clockConsoleLogs) return;
  const p = document.createElement('p');
  p.textContent = logStr;
  if (logStr.includes('[CRISTIAN]')) p.style.color = '#60a5fa';
  else if (logStr.includes('[BERKELEY]')) p.style.color = '#c084fc';
  else if (logStr.includes('[LAMPORT]')) p.style.color = '#34d399';
  
  clockConsoleLogs.appendChild(p);
  clockConsoleLogs.scrollTop = clockConsoleLogs.scrollHeight;
}

// ------------------------------------------------------------
// Clock Topology Canvas Renderer (Visual Packet Movement & Live Pulses)
// ------------------------------------------------------------

const clockCanvas = document.getElementById('clock-topology-canvas');
let clockCtx = clockCanvas ? clockCanvas.getContext('2d') : null;
let clockCanvasAnimId = null;
let hoveredClockNode = null;

const clockNodesCoords = {
  'VTS': { x: 275, y: 60, label: 'VTS (Coordinator)', color: '#6366f1', radius: 26, role: 'TIME_SERVER' },
  'Peer-1': { x: 85, y: 230, label: 'Peer-1', color: '#10b981', radius: 22, role: 'P2P_NODE' },
  'Peer-2': { x: 195, y: 230, label: 'Peer-2', color: '#10b981', radius: 22, role: 'P2P_NODE' },
  'Edge-1': { x: 355, y: 230, label: 'Edge-1', color: '#06b6d4', radius: 22, role: 'EDGE_SERVER' },
  'CDN-1': { x: 465, y: 230, label: 'CDN-1', color: '#a855f7', radius: 22, role: 'CDN_NODE' }
};

// Ambient live synchronization telemetry pulses (Always Active)
const clockAmbientPulses = [
  { from: 'VTS', to: 'Peer-1', progress: 0.1, speed: 0.010, color: '#10b981' },
  { from: 'VTS', to: 'Peer-2', progress: 0.4, speed: 0.009, color: '#10b981' },
  { from: 'VTS', to: 'Edge-1', progress: 0.7, speed: 0.012, color: '#06b6d4' },
  { from: 'VTS', to: 'CDN-1', progress: 0.9, speed: 0.008, color: '#a855f7' }
];

function spawnClockPacket(fromId, toId, label = 'MSG') {
  if (!clockNodesCoords[fromId] || !clockNodesCoords[toId]) return;
  
  let packetColor = '#f59e0b'; // Default amber for request/poll
  if (label.includes('ADJUST') || label.includes('RESP') || label.includes('CORRECT')) {
    packetColor = '#10b981'; // Green for adjustments / responses
  } else if (label.startsWith('L=')) {
    packetColor = '#a855f7'; // Purple for Lamport logical time
  } else if (label.includes('TIME_REQ')) {
    packetColor = '#38bdf8'; // Sky blue for time requests
  }

  clockAnimationPackets.push({
    from: fromId,
    to: toId,
    label,
    progress: 0,
    speed: 0.022,
    color: packetColor,
    tail: []
  });

  const counterBadge = document.getElementById('clock-packet-counter');
  if (counterBadge) {
    counterBadge.textContent = `Packets: ${clockAnimationPackets.length} Active`;
    counterBadge.className = 'badge yellow';
  }
}

// Mouse interaction for tooltip
if (clockCanvas) {
  clockCanvas.addEventListener('mousemove', (e) => {
    const rect = clockCanvas.getBoundingClientRect();
    const scaleX = clockCanvas.width / rect.width;
    const scaleY = clockCanvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    hoveredClockNode = null;
    for (const [id, node] of Object.entries(clockNodesCoords)) {
      const dist = Math.hypot(mouseX - node.x, mouseY - node.y);
      if (dist <= node.radius + 6) {
        hoveredClockNode = id;
        break;
      }
    }
  });

  clockCanvas.addEventListener('mouseleave', () => {
    hoveredClockNode = null;
  });
}

function drawClockTopology() {
  if (!clockCanvas) return;
  if (!clockCtx) {
    clockCtx = clockCanvas.getContext('2d');
    if (!clockCtx) return;
  }

  const now = Date.now();
  clockCtx.clearRect(0, 0, clockCanvas.width, clockCanvas.height);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  // 1. Draw Links from VTS Coordinator to all nodes
  const vts = clockNodesCoords['VTS'];
  ['Peer-1', 'Peer-2', 'Edge-1', 'CDN-1'].forEach(id => {
    const target = clockNodesCoords[id];
    
    // Background connection line
    clockCtx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.09)' : 'rgba(255, 255, 255, 0.07)';
    clockCtx.lineWidth = 3;
    clockCtx.beginPath();
    clockCtx.moveTo(vts.x, vts.y);
    clockCtx.lineTo(target.x, target.y);
    clockCtx.stroke();

    // Subtle glow overlay on links
    clockCtx.strokeStyle = isLight ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.15)';
    clockCtx.lineWidth = 1;
    clockCtx.stroke();
  });

  // 2. Draw Ambient Live Synchronization Pulses
  clockAmbientPulses.forEach(p => {
    const src = clockNodesCoords[p.from];
    const dst = clockNodesCoords[p.to];
    if (src && dst) {
      p.progress += p.speed;
      if (p.progress > 1) p.progress = 0;

      const px = src.x + (dst.x - src.x) * p.progress;
      const py = src.y + (dst.y - src.y) * p.progress;

      // Pulse glow dot
      clockCtx.fillStyle = p.color;
      clockCtx.shadowColor = p.color;
      clockCtx.shadowBlur = 8;
      clockCtx.beginPath();
      clockCtx.arc(px, py, 4, 0, Math.PI * 2);
      clockCtx.fill();
      clockCtx.shadowBlur = 0;
    }
  });

  // 3. Draw Active High-Energy Algorithm Packets
  clockAnimationPackets.forEach((pkt) => {
    const src = clockNodesCoords[pkt.from];
    const dst = clockNodesCoords[pkt.to];
    if (src && dst) {
      pkt.progress += pkt.speed;
      const px = src.x + (dst.x - src.x) * pkt.progress;
      const py = src.y + (dst.y - src.y) * pkt.progress;

      // Save tail position
      pkt.tail.push({ x: px, y: py });
      if (pkt.tail.length > 6) pkt.tail.shift();

      // Draw particle tail
      for (let t = 0; t < pkt.tail.length; t++) {
        const tp = pkt.tail[t];
        const alpha = (t + 1) / pkt.tail.length * 0.5;
        clockCtx.fillStyle = pkt.color;
        clockCtx.globalAlpha = alpha;
        clockCtx.beginPath();
        clockCtx.arc(tp.x, tp.y, 3 + (t * 0.6), 0, Math.PI * 2);
        clockCtx.fill();
      }
      clockCtx.globalAlpha = 1.0;

      // Draw Packet Core Bubble
      clockCtx.fillStyle = pkt.color;
      clockCtx.shadowColor = pkt.color;
      clockCtx.shadowBlur = 14;
      clockCtx.beginPath();
      clockCtx.arc(px, py, 9, 0, Math.PI * 2);
      clockCtx.fill();
      clockCtx.shadowBlur = 0;

      // Packet Label Badge Background
      const textWidth = clockCtx.measureText(pkt.label).width || 40;
      const badgeW = Math.max(textWidth + 14, 46);
      const badgeH = 18;
      const badgeX = px - badgeW / 2;
      const badgeY = py - 26;

      clockCtx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)';
      clockCtx.strokeStyle = pkt.color;
      clockCtx.lineWidth = 1.5;
      
      // Rounded pill rect
      clockCtx.beginPath();
      if (clockCtx.roundRect) {
        clockCtx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      } else {
        clockCtx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      clockCtx.fill();
      clockCtx.stroke();

      // Packet Label Text
      clockCtx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
      clockCtx.font = 'bold 9px Outfit, sans-serif';
      clockCtx.textAlign = 'center';
      clockCtx.textBaseline = 'middle';
      clockCtx.fillText(pkt.label, px, badgeY + badgeH / 2);
    }
  });

  // Clean up completed packets
  clockAnimationPackets = clockAnimationPackets.filter(p => p.progress < 1);

  // Update dynamic packet counter badge
  const counterBadge = document.getElementById('clock-packet-counter');
  if (counterBadge) {
    if (clockAnimationPackets.length > 0) {
      counterBadge.textContent = `Packets: ${clockAnimationPackets.length} Active`;
      counterBadge.className = 'badge yellow';
    } else {
      counterBadge.textContent = `Sync Pulse: Active`;
      counterBadge.className = 'badge green';
    }
  }

  // 4. Draw VTS Coordinator Concentric Beacon Wave Rings
  const waveCycle = (now % 2400) / 2400; // 0 to 1
  const waveRadius = vts.radius + (waveCycle * 32);
  const waveAlpha = Math.max(0, (1 - waveCycle) * 0.45);
  clockCtx.strokeStyle = `rgba(99, 102, 241, ${waveAlpha})`;
  clockCtx.lineWidth = 2;
  clockCtx.beginPath();
  clockCtx.arc(vts.x, vts.y, waveRadius, 0, Math.PI * 2);
  clockCtx.stroke();

  // 5. Draw All Topology Nodes
  Object.keys(clockNodesCoords).forEach(key => {
    const node = clockNodesCoords[key];
    const nodeData = clockState.nodes.find(n => n.id === key);
    const isVts = key === 'VTS';
    const isHovered = hoveredClockNode === key;

    const offsetMs = nodeData ? (nodeData.offsetMs || 0) : 0;
    const isSynced = isVts || Math.abs(offsetMs) < 50;

    // Node Pulsing Halo
    const pulseStrength = (Math.sin(now / 350) + 1) / 2; // 0 to 1
    const haloRadius = node.radius + 4 + (pulseStrength * (isHovered ? 6 : 3));
    const haloColor = isVts
      ? `rgba(99, 102, 241, ${0.25 + pulseStrength * 0.25})`
      : isSynced
        ? `rgba(16, 185, 129, ${0.20 + pulseStrength * 0.25})`
        : `rgba(245, 158, 11, ${0.25 + pulseStrength * 0.30})`;

    clockCtx.fillStyle = haloColor;
    clockCtx.beginPath();
    clockCtx.arc(node.x, node.y, haloRadius, 0, Math.PI * 2);
    clockCtx.fill();

    // Node Background
    clockCtx.fillStyle = isLight ? '#ffffff' : 'rgba(18, 20, 32, 0.95)';
    clockCtx.strokeStyle = isHovered ? '#ffffff' : node.color;
    clockCtx.lineWidth = isHovered ? 3.5 : 2.5;
    
    clockCtx.shadowColor = node.color;
    clockCtx.shadowBlur = isHovered ? 16 : 8;
    clockCtx.beginPath();
    clockCtx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    clockCtx.fill();
    clockCtx.stroke();
    clockCtx.shadowBlur = 0;

    // Node Text Content
    clockCtx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
    clockCtx.font = `bold ${isVts ? '11px' : '10px'} Outfit, sans-serif`;
    clockCtx.textAlign = 'center';
    clockCtx.textBaseline = 'middle';
    clockCtx.fillText(key, node.x, node.y - (isVts ? 5 : 6));

    // Secondary line: Offset or Status Pill
    if (isVts) {
      clockCtx.font = '8px Outfit, sans-serif';
      clockCtx.fillStyle = '#6366f1';
      clockCtx.fillText('Master (0ms)', node.x, node.y + 7);
    } else {
      const offsetSec = (offsetMs / 1000).toFixed(1);
      const sign = offsetMs > 0 ? '+' : '';
      const offsetText = isSynced ? 'SYNCED' : `${sign}${offsetSec}s`;
      
      clockCtx.font = 'bold 8px Outfit, sans-serif';
      clockCtx.fillStyle = isSynced ? '#10b981' : '#f59e0b';
      clockCtx.fillText(offsetText, node.x, node.y + 6);
    }

    // Lamport counter indicator (if Lamport active or > 0)
    const lamportVal = clockState.lamportClocks ? clockState.lamportClocks[key] : null;
    if (lamportVal !== null && lamportVal !== undefined && (localActiveAlgorithm === 'lamport' || lamportVal > 0)) {
      const badgeW = 32;
      const badgeH = 14;
      const badgeX = node.x - badgeW / 2;
      const badgeY = node.y + node.radius + 4;

      clockCtx.fillStyle = isLight ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.25)';
      clockCtx.strokeStyle = '#a855f7';
      clockCtx.lineWidth = 1;
      clockCtx.beginPath();
      if (clockCtx.roundRect) {
        clockCtx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
      } else {
        clockCtx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      clockCtx.fill();
      clockCtx.stroke();

      clockCtx.fillStyle = isLight ? '#7e22ce' : '#d8b4fe';
      clockCtx.font = 'bold 8px Outfit, sans-serif';
      clockCtx.fillText(`L = ${lamportVal}`, node.x, badgeY + badgeH / 2);
    }
  });

  // 6. Draw Hover Tooltip if a node is hovered
  if (hoveredClockNode) {
    const node = clockNodesCoords[hoveredClockNode];
    const nodeData = clockState.nodes.find(n => n.id === hoveredClockNode);
    if (node && nodeData) {
      const isVts = hoveredClockNode === 'VTS';
      const offsetMs = nodeData.offsetMs || 0;
      const statusText = isVts ? 'Master Time Server' : (Math.abs(offsetMs) < 50 ? 'Synchronized' : 'Drift Detected');
      const correction = nodeData.lastCorrectionMs ? `${nodeData.lastCorrectionMs > 0 ? '+' : ''}${nodeData.lastCorrectionMs}ms` : '0ms';

      const ttW = 160;
      const ttH = 68;
      let ttX = node.x - ttW / 2;
      let ttY = node.y - node.radius - ttH - 12;
      if (ttY < 10) ttY = node.y + node.radius + 14;
      if (ttX < 10) ttX = 10;
      if (ttX + ttW > clockCanvas.width - 10) ttX = clockCanvas.width - ttW - 10;

      // Tooltip background card
      clockCtx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 23, 42, 0.95)';
      clockCtx.strokeStyle = node.color;
      clockCtx.lineWidth = 1.5;
      clockCtx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      clockCtx.shadowBlur = 12;

      clockCtx.beginPath();
      if (clockCtx.roundRect) {
        clockCtx.roundRect(ttX, ttY, ttW, ttH, 8);
      } else {
        clockCtx.rect(ttX, ttY, ttW, ttH);
      }
      clockCtx.fill();
      clockCtx.stroke();
      clockCtx.shadowBlur = 0;

      // Tooltip content
      clockCtx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
      clockCtx.font = 'bold 11px Outfit, sans-serif';
      clockCtx.textAlign = 'left';
      clockCtx.textBaseline = 'top';
      clockCtx.fillText(`${nodeData.name || hoveredClockNode}`, ttX + 10, ttY + 8);

      clockCtx.font = '9px Outfit, sans-serif';
      clockCtx.fillStyle = isLight ? '#475569' : '#94a3b8';
      clockCtx.fillText(`Type: ${nodeData.type || 'Node'}`, ttX + 10, ttY + 24);
      clockCtx.fillText(`Offset: ${offsetMs >= 0 ? '+' : ''}${offsetMs} ms`, ttX + 10, ttY + 38);
      clockCtx.fillText(`Status: ${statusText}`, ttX + 10, ttY + 52);
    }
  }

  clockCanvasAnimId = requestAnimationFrame(drawClockTopology);
}

// Initial draw and load
renderClockNodesTable();
if (clockCanvas) {
  drawClockTopology();
}

// Fetch initial clock state via REST API on load
fetch(apiUrl('/api/clock/state'))
  .then(r => r.json())
  .then(data => {
    if (data && data.nodes) {
      updateClockState(data);
    }
  })
  .catch(() => {});

// Initialize active route after all DOM elements and canvas contexts are ready
initRouteOnLoad();


