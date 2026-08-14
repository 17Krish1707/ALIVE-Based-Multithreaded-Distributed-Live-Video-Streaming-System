import express from 'express';
import fileUpload from 'express-fileupload';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { Worker } from 'worker_threads';
import dotenv from 'dotenv';
import os from 'os';
import { 
  initDB, 
  ensureDB,
  saveVideo, 
  getLatestVideo, 
  startLiveStream, 
  stopLiveStream, 
  getStreamStatus, 
  createClientSession, 
  updateClientSession, 
  getClientSession, 
  getActiveSessions, 
  getAllSessions, 
  addSourceAllocation, 
  releaseSourceAllocation, 
  logSourceSwitch, 
  getSourceSwitches, 
  getSourceAllocationHistory, 
  getPerformanceMetrics,
  getVideoRecord
} from './db.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.SERVER_PORT || 6000;
const UPLOADS_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(process.cwd(), 'uploads');
const TEMP_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'temp')
  : path.join(process.cwd(), 'temp');

// Ensure uploads & temp directories exist safely
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
} catch (err) {
  console.error('[SERVER] Directory creation notice:', err.message);
}

// Database initialization middleware for serverless invocations
app.use(async (req, res, next) => {
  try {
    await ensureDB();
  } catch (err) {
    console.error('[SERVER] DB ensure notice:', err.message);
  }
  next();
});

// 1 GB Max Upload Limit Configuration
const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024; // 1 GB (1073741824 bytes)

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Use disk streaming for uploads so large 1 GB files do not bloat RAM
app.use(fileUpload({
  limits: { fileSize: MAX_UPLOAD_SIZE },
  useTempFiles: true,
  tempFileDir: TEMP_DIR,
  abortOnLimit: true,
  limitHandler: (req, res) => {
    res.status(413).json({ error: 'File size exceeds the 1 GB maximum upload limit.' });
  }
}));

// Socket.io client script fallback route & Favicon route
app.get('/socket.io/socket.io.js', (req, res) => {
  res.redirect('https://cdn.socket.io/4.7.5/socket.io.min.js');
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Serve static frontend files
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/uploads', express.static(UPLOADS_DIR, {
  acceptRanges: true,
  setHeaders: (res) => {
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));

// Dedicated High-Performance HTTP 206 Range Video Streaming Endpoint
app.get('/video/:filename', async (req, res) => {
  const requestedFilename = path.basename(req.params.filename);
  let filePath = path.join(UPLOADS_DIR, requestedFilename);

  // 1. Check direct file path in UPLOADS_DIR
  if (!fs.existsSync(filePath)) {
    // 2. Query Database for matching filename or filepath
    try {
      const rec = await getVideoRecord(requestedFilename);
      if (rec) {
        const candidatePath = path.join(UPLOADS_DIR, rec.filepath || rec.filename);
        if (fs.existsSync(candidatePath)) {
          filePath = candidatePath;
        }
      }
    } catch (err) {
      console.error('[VIDEO ROUTE] DB lookup error:', err);
    }
  }

  // 3. Fallback: Check root directory
  if (!fs.existsSync(filePath)) {
    const rootPath = path.join(process.cwd(), requestedFilename);
    if (fs.existsSync(rootPath)) {
      filePath = rootPath;
    }
  }

  // 4. Fallback: Check for any mp4 file in UPLOADS_DIR or sample_live_video.mp4
  if (!fs.existsSync(filePath)) {
    try {
      const uploadedMp4s = fs.readdirSync(UPLOADS_DIR).filter(f => f.toLowerCase().endsWith('.mp4'));
      if (uploadedMp4s.length > 0) {
        uploadedMp4s.sort((a, b) => fs.statSync(path.join(UPLOADS_DIR, b)).mtimeMs - fs.statSync(path.join(UPLOADS_DIR, a)).mtimeMs);
        filePath = path.join(UPLOADS_DIR, uploadedMp4s[0]);
      } else {
        const samplePath = path.join(process.cwd(), 'sample_live_video.mp4');
        if (fs.existsSync(samplePath)) {
          filePath = samplePath;
        }
      }
    } catch (err) {
      console.error('[VIDEO ROUTE] Fallback file search error:', err);
    }
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Video file not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// ============================================================
// GLOBAL STATE & MULTITHREADING METRICS
// ============================================================
const inMemoryLogs = [];
const activeWorkers = new Map(); // clientId -> { worker, threadId, clientId, sourceId, startTime, currentChunk, totalChunks, status, lastComputeMs }
const activeSessionsMap = new Map(); // clientId -> socket.id

const multithreadingMetrics = {
  totalCreated: 0,
  completed: 0,
  failed: 0,
  totalExecutionTimeMs: 0,
  longestExecutionTimeMs: 0
};

// Log helpers
function logEvent(message, isMainThread = true) {
  const timestamp = new Date().toISOString();
  const prefix = isMainThread ? '[MAIN THREAD]' : '[WORKER THREAD]';
  const logStr = `[${timestamp}] ${message}`;
  
  inMemoryLogs.push(logStr);
  if (inMemoryLogs.length > 250) {
    inMemoryLogs.shift();
  }
  
  console.log(`${prefix} ${logStr}`);
  io.emit('log_event', logStr);
}

function printActiveWorkersSummary() {
  const total = activeWorkers.size;
  console.log('\n============================================================');
  console.log('               ACTIVE WORKER THREADS SUMMARY                ');
  console.log('============================================================');
  console.log('Thread ID    Client         Source      State        Progress');
  console.log('------------------------------------------------------------');
  if (total === 0) {
    console.log('None         -              -           IDLE         -');
  } else {
    for (const info of activeWorkers.values()) {
      const tid = String(info.threadId || 'Starting').padEnd(12);
      const cid = String(info.clientId).padEnd(14);
      const src = String(info.sourceId).padEnd(11);
      const state = String(info.status || 'STREAMING').padEnd(12);
      const prog = `Chunk ${info.currentChunk || 0} (Active)`;
      console.log(`${tid} ${cid} ${src} ${state} ${prog}`);
    }
  }
  console.log('------------------------------------------------------------');
  console.log(`Total Active Workers: ${total} | Main Thread: ONLINE (Event Loop Active)`);
  console.log('============================================================\n');
}

function getMultithreadingMetrics() {
  return {
    activeWorkers: activeWorkers.size,
    totalCreated: multithreadingMetrics.totalCreated,
    completed: multithreadingMetrics.completed,
    failed: multithreadingMetrics.failed,
    avgExecutionTimeMs: multithreadingMetrics.completed > 0 ? Math.round(multithreadingMetrics.totalExecutionTimeMs / multithreadingMetrics.completed) : 0,
    longestExecutionTimeMs: multithreadingMetrics.longestExecutionTimeMs,
    mainThreadStatus: 'ONLINE (Responsive)',
    workers: getActiveThreadsData()
  };
}

function getActiveThreadsData() {
  const list = [];
  const now = Date.now();
  for (const info of activeWorkers.values()) {
    list.push({
      threadId: info.threadId,
      clientId: info.clientId,
      sourceId: info.sourceId,
      status: info.status || 'STREAMING',
      currentChunk: info.currentChunk || 0,
      totalChunks: 'LIVE',
      startTime: info.startTime,
      runtimeSecs: info.startTime ? Math.round((now - info.startTime) / 1000) : 0,
      lastComputeMs: info.lastComputeMs || 0
    });
  }
  return list;
}

// Distributed Video Sources State
const sources = [
  { id: 'Peer-1', name: 'Peer-1', type: 'P2P Peer', latency: 20, capacity: 1, connected: 0, online: true, totalRequests: 0, totalDuration: 0 },
  { id: 'Peer-2', name: 'Peer-2', type: 'P2P Peer', latency: 30, capacity: 1, connected: 0, online: true, totalRequests: 0, totalDuration: 0 },
  { id: 'Edge-1', name: 'Edge-1', type: 'Edge Server', latency: 50, capacity: 2, connected: 0, online: true, totalRequests: 0, totalDuration: 0 },
  { id: 'CDN-1', name: 'CDN-1', type: 'CDN', latency: 100, capacity: 3, connected: 0, online: true, totalRequests: 0, totalDuration: 0 }
];

// Helper to format file sizes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper to estimate video duration of MP4 files
function parseMp4Duration(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(65536);
    fs.readSync(fd, buffer, 0, 65536, 0);
    fs.closeSync(fd);

    const idx = buffer.indexOf('mvhd');
    if (idx !== -1) {
      const timescale = buffer.readUInt32BE(idx + 20);
      const duration = buffer.readUInt32BE(idx + 24);
      if (timescale > 0 && duration > 0) {
        return Math.round((duration / timescale) * 10) / 10;
      }
    }
  } catch (err) {
    console.error('[MAIN THREAD] MP4 header duration parse notice:', err.message);
  }
  return 300; // Fallback estimate: 5 minutes
}

// VTS Source Selection Logic
function selectBestSource() {
  let selected = null;
  for (const source of sources) {
    if (source.online && source.connected < source.capacity) {
      if (selected === null || source.latency < selected.latency) {
        selected = source;
      }
    }
  }
  return selected;
}

// ============================================================
// API ENDPOINTS
// ============================================================

// Helper for safe file moving across devices and temp paths
async function safeMoveFile(videoFile, destinationPath) {
  if (videoFile.tempFilePath && fs.existsSync(videoFile.tempFilePath)) {
    try {
      fs.copyFileSync(videoFile.tempFilePath, destinationPath);
      try { fs.unlinkSync(videoFile.tempFilePath); } catch (e) {}
      return;
    } catch (e) {
      // Fall back to mv
    }
  }

  return new Promise((resolve, reject) => {
    videoFile.mv(destinationPath, (err) => {
      if (err) {
        try {
          if (videoFile.data) {
            fs.writeFileSync(destinationPath, videoFile.data);
            return resolve();
          }
        } catch (e) {}
        return reject(err);
      }
      resolve();
    });
  });
}

// Upload Video (Up to 1 GB)
app.post('/api/upload', async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No video file was uploaded. Please select an MP4 file.' });
    }

    const videoFile = req.files.video || Object.values(req.files)[0];
    if (!videoFile) {
      return res.status(400).json({ error: 'No valid video file payload found in request.' });
    }
    
    // Validate MP4 format
    if (!videoFile.name || !videoFile.name.toLowerCase().endsWith('.mp4')) {
      return res.status(400).json({ error: 'Only MP4 video files (.mp4) are allowed.' });
    }

    // Validate size within 1 GB limit
    if (videoFile.size > MAX_UPLOAD_SIZE) {
      return res.status(413).json({ error: 'File exceeds the maximum upload limit of 1 GB.' });
    }

    const safeName = videoFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filename = `${Date.now()}-${safeName}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    // Move file safely
    await safeMoveFile(videoFile, filepath);

    let duration = req.body?.duration ? parseFloat(req.body.duration) : 0;
    if (!duration || isNaN(duration)) {
      duration = parseMp4Duration(filepath);
    }

    const videoId = await saveVideo(videoFile.name, filename, videoFile.size, duration);
    const uploadTimestamp = new Date().toISOString();
    const sizeFormatted = formatBytes(videoFile.size);

    logEvent(`Admin uploaded master video: ${videoFile.name} (${sizeFormatted}, ${Math.round(duration)}s)`);

    res.json({
      success: true,
      video: {
        id: videoId,
        name: videoFile.name,
        filename,
        filepath: filename,
        size: videoFile.size,
        sizeFormatted,
        duration,
        uploadTimestamp,
        fileType: videoFile.mimetype || 'video/mp4',
        status: 'Upload complete'
      }
    });
  } catch (err) {
    console.error('[MAIN THREAD] Upload error:', err);
    res.status(500).json({ error: err.message || 'Internal video processing error' });
  }
});

// Register Master Video Resource (For Serverless & Large File Metadata)
app.post('/api/register-video', async (req, res) => {
  try {
    const { name, size, duration } = req.body || {};
    const videoName = name || 'live_stream_master.mp4';
    const videoSize = parseInt(size, 10) || 10485760;
    const videoDuration = parseFloat(duration) || 300;

    const safeName = videoName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filename = `${Date.now()}-${safeName}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    // Create a working sample MP4 file if absent
    if (!fs.existsSync(filepath)) {
      const samplePath = path.join(process.cwd(), 'sample_live_video.mp4');
      if (fs.existsSync(samplePath)) {
        try { fs.copyFileSync(samplePath, filepath); } catch (e) {}
      } else {
        try { fs.writeFileSync(filepath, Buffer.alloc(1024)); } catch (e) {}
      }
    }

    const videoId = await saveVideo(videoName, filename, videoSize, videoDuration);
    const uploadTimestamp = new Date().toISOString();
    const sizeFormatted = formatBytes(videoSize);

    logEvent(`Admin registered master video: ${videoName} (${sizeFormatted}, ${Math.round(videoDuration)}s)`);

    res.json({
      success: true,
      video: {
        id: videoId,
        name: videoName,
        filename,
        filepath: filename,
        size: videoSize,
        sizeFormatted,
        duration: videoDuration,
        uploadTimestamp,
        fileType: 'video/mp4',
        status: 'Upload complete'
      }
    });
  } catch (err) {
    console.error('[SERVER] Video registration error:', err);
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// Get Stream Status and Sources Details
app.get('/api/stream-info', async (req, res) => {
  try {
    const status = await getStreamStatus();
    const metrics = await getPerformanceMetrics();
    const threadMetrics = getMultithreadingMetrics();
    res.json({ status, sources, metrics, threadMetrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// WEBSOCKET COMMUNICATION & MULTITHREADING
// ============================================================

io.on('connection', (socket) => {
  let clientSessionId = null;

  // Admin registers
  socket.on('admin_register', async () => {
    socket.join('admins');
    const status = await getStreamStatus();
    const metrics = await getPerformanceMetrics();
    const history = await getSourceAllocationHistory();
    const switches = await getSourceSwitches();
    const allSessions = await getAllSessions();
    
    socket.emit('admin_init', {
      status,
      sources,
      metrics,
      logs: inMemoryLogs,
      history: history.slice(0, 15),
      switches: switches.slice(0, 15),
      sessions: allSessions.slice(0, 15),
      threads: getActiveThreadsData(),
      threadMetrics: getMultithreadingMetrics()
    });
  });

  // Client connects and gets unique session ID
  socket.on('client_register', async (data) => {
    clientSessionId = data.clientId || `CLIENT-${Math.floor(1000 + Math.random() * 9000)}`;
    activeSessionsMap.set(clientSessionId, socket.id);
    
    const userAgent = socket.handshake.headers['user-agent'] || '';
    let browser = 'Unknown';
    let os = 'Unknown';
    
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iPhone')) os = 'iOS';

    const ip = socket.handshake.address || '127.0.0.1';
    
    await createClientSession(clientSessionId, ip, browser, os);
    logEvent(`Client connected: ${clientSessionId} (${browser} on ${os}, IP: ${ip})`);
    
    socket.emit('client_registered', { clientId: clientSessionId });
    io.to('admins').emit('client_list_update', await getAllSessions());
    io.to('admins').emit('metrics_update', await getPerformanceMetrics());
  });

  // Client requests live video stream (WATCH LIVE)
  socket.on('watch_live', async () => {
    if (!clientSessionId) return;

    const requestTime = new Date().toISOString();
    logEvent(`Received streaming request from ${clientSessionId}`);
    
    await updateClientSession(clientSessionId, 'REQUESTING', { request_time: requestTime });
    io.to('admins').emit('client_list_update', await getAllSessions());

    // Check stream status
    const stream = await getStreamStatus();
    if (!stream || stream.status !== 'LIVE') {
      logEvent(`VTS rejected request from ${clientSessionId}: Stream is OFFLINE.`);
      await updateClientSession(clientSessionId, 'FAILED');
      socket.emit('stream_error', { message: 'Stream is OFFLINE' });
      io.to('admins').emit('client_list_update', await getAllSessions());
      return;
    }

    logEvent(`VTS evaluating distributed sources for ${clientSessionId}...`);
    
    const startTime = Date.now();
    const source = selectBestSource();

    if (!source) {
      logEvent(`VTS Capacity Exceeded: No sources available for ${clientSessionId}.`);
      await updateClientSession(clientSessionId, 'FAILED');
      multithreadingMetrics.failed++;
      socket.emit('stream_error', { message: 'All distributed sources are at capacity. Please try again later.' });
      io.to('admins').emit('client_list_update', await getAllSessions());
      io.to('admins').emit('metrics_update', await getPerformanceMetrics());
      io.to('admins').emit('thread_metrics_update', getMultithreadingMetrics());
      return;
    }

    // Allocate source
    const allocationTime = Date.now();
    const processingTime = allocationTime - startTime;
    source.connected++;
    source.totalRequests++;

    logEvent(`Allocating ${source.name} (Type: ${source.type}, Latency: ${source.latency}ms) for ${clientSessionId}. VTS Processing: ${processingTime}ms`);

    await updateClientSession(clientSessionId, 'STREAMING', {
      allocation_time: new Date(allocationTime).toISOString(),
      stream_start_time: new Date(allocationTime).toISOString(),
      current_source: source.id,
      processing_time_ms: processingTime
    });

    await addSourceAllocation(clientSessionId, source.id, source.type, new Date(allocationTime).toISOString());

    // Send confirmation to client
    socket.emit('source_allocated', {
      sourceId: source.id,
      sourceType: source.type,
      latency: source.latency,
      requestTime,
      allocationTime: new Date(allocationTime).toISOString(),
      processingTimeMs: processingTime,
      videoName: stream.filepath || stream.filename,
      videoDuration: stream.duration,
      streamStartedAt: stream.started_at
    });

    // Notify Admins
    io.to('admins').emit('source_update', sources);
    io.to('admins').emit('client_list_update', await getAllSessions());
    io.to('admins').emit('metrics_update', await getPerformanceMetrics());

    // ------------------------------------------------------------
    // REAL NODE.JS MULTITHREADED WORKER SPAWN (Continuous Live Stream)
    // ------------------------------------------------------------
    logEvent(`Spawning dedicated Worker Thread for ${clientSessionId}...`);

    const worker = new Worker(path.join(process.cwd(), 'worker.js'), {
      workerData: {
        clientId: clientSessionId,
        sourceId: source.id,
        latency: source.latency,
        chunkProcessingTime: 400,
        continuous: true
      }
    });

    multithreadingMetrics.totalCreated++;

    const workerInfo = {
      worker,
      threadId: worker.threadId,
      clientId: clientSessionId,
      sourceId: source.id,
      startTime: Date.now(),
      currentChunk: 0,
      totalChunks: 'LIVE',
      status: 'CREATED',
      lastComputeMs: 0
    };

    activeWorkers.set(clientSessionId, workerInfo);

    // Terminal output for worker creation
    console.log('\n============================================================');
    console.log('[MULTITHREADING]');
    console.log(`[${new Date().toLocaleTimeString()}.${String(Date.now() % 1000).padStart(3, '0')}] Client: ${clientSessionId}`);
    console.log(`Worker Thread ID: ${worker.threadId}`);
    console.log(`Status: CREATED`);
    console.log(`Source: ${source.id}`);
    console.log('============================================================\n');

    printActiveWorkersSummary();

    io.to('admins').emit('thread_list_update', getActiveThreadsData());
    io.to('admins').emit('thread_metrics_update', getMultithreadingMetrics());

    worker.on('message', async (msg) => {
      const currentWorkerInfo = activeWorkers.get(msg.clientId);
      if (!currentWorkerInfo) return;

      if (msg.event === 'started') {
        currentWorkerInfo.threadId = msg.threadId;
        currentWorkerInfo.status = 'STREAMING';

        console.log(`[${new Date().toLocaleTimeString()}.${String(Date.now() % 1000).padStart(3, '0')}] Worker-${msg.threadId}`);
        console.log(`Client: ${msg.clientId}`);
        console.log(`Status: STARTED`);
        console.log(`Task: STREAM_PROCESSING\n`);

        io.to('admins').emit('thread_list_update', getActiveThreadsData());
        io.to('admins').emit('thread_metrics_update', getMultithreadingMetrics());

      } else if (msg.event === 'chunk') {
        currentWorkerInfo.currentChunk = msg.chunkIndex;
        currentWorkerInfo.lastComputeMs = msg.computeTimeMs;

        // Structured execution message showing concurrent interleaved activity
        console.log(`[Worker-${msg.threadId}] ${msg.clientId} → Processing chunk ${msg.chunkIndex} (Hash: ${msg.hash}, CPU: ${msg.computeTimeMs}ms, Delivery: ${msg.elapsedTimeMs}ms)`);

        // Send chunk to client socket for real-time telemetry
        const clientSocketId = activeSessionsMap.get(msg.clientId);
        if (clientSocketId) {
          const session = await getClientSession(msg.clientId);
          const currentSrcId = session ? session.current_source : msg.sourceId;
          const currentSrc = sources.find(s => s.id === currentSrcId) || { name: currentSrcId };

          io.to(clientSocketId).emit('stream_chunk', {
            chunkIndex: msg.chunkIndex,
            totalChunks: msg.totalChunks,
            sourceName: currentSrc.name,
            threadId: msg.threadId,
            computeTimeMs: msg.computeTimeMs,
            hash: msg.hash
          });
        }

        io.to('admins').emit('thread_list_update', getActiveThreadsData());

      } else if (msg.event === 'complete') {
        // Bounded worker complete
        const execTime = msg.totalExecutionTimeMs || (Date.now() - currentWorkerInfo.startTime);
        handleCompletedWorker(msg.clientId, msg.threadId, msg.sourceId, execTime);
      }
    });

    worker.on('error', (err) => {
      console.error(`[WORKER THREAD ${worker.threadId}] Error for ${clientSessionId}:`, err);
      multithreadingMetrics.failed++;
      activeWorkers.delete(clientSessionId);
      io.to('admins').emit('thread_metrics_update', getMultithreadingMetrics());
      io.to('admins').emit('thread_list_update', getActiveThreadsData());
    });

    worker.on('exit', () => {
      if (activeWorkers.has(clientSessionId)) {
        activeWorkers.delete(clientSessionId);
        printActiveWorkersSummary();
        io.to('admins').emit('thread_list_update', getActiveThreadsData());
        io.to('admins').emit('thread_metrics_update', getMultithreadingMetrics());
      }
    });
  });

  // Admin Toggles Stream Control
  socket.on('toggle_stream', async (data) => {
    if (data.action === 'START') {
      const video = await getLatestVideo();
      if (!video) {
        socket.emit('stream_control_error', { message: 'Upload a video file first.' });
        return;
      }
      const startedAt = await startLiveStream(video.id);
      logEvent(`Admin started the LIVE video broadcast.`);
      io.emit('stream_status_change', { status: 'LIVE', startedAt, videoName: video.filepath || video.filename, videoDuration: video.duration });
    } else {
      await stopLiveStream();
      logEvent(`Admin stopped the video broadcast.`);
      io.emit('stream_status_change', { status: 'OFFLINE' });
      
      // Terminate all active worker threads and disconnect clients
      for (const [clientId, info] of activeWorkers.entries()) {
        if (info.worker) {
          info.worker.terminate();
          console.log(`[MAIN THREAD] Terminated Worker Thread ${info.threadId} on broadcast stop.`);
        }
        activeWorkers.delete(clientId);
        
        const session = await getClientSession(clientId);
        if (session && session.status === 'STREAMING') {
          const finalSource = sources.find(s => s.id === session.current_source);
          if (finalSource) {
            finalSource.connected = Math.max(0, finalSource.connected - 1);
          }
          const nowStr = new Date().toISOString();
          const durationSecs = Math.round((Date.now() - new Date(session.stream_start_time).getTime()) / 1000);
          
          await updateClientSession(clientId, 'DISCONNECTED', { disconnect_time: nowStr });
          await releaseSourceAllocation(clientId, session.current_source, nowStr, durationSecs);
        }
      }

      // Reset source loads
      sources.forEach(s => s.connected = 0);

      printActiveWorkersSummary();

      io.emit('stream_terminated');
      io.to('admins').emit('source_update', sources);
      io.to('admins').emit('client_list_update', await getAllSessions());
      io.to('admins').emit('thread_list_update', getActiveThreadsData());
      io.to('admins').emit('thread_metrics_update', getMultithreadingMetrics());
      io.to('admins').emit('metrics_update', await getPerformanceMetrics());
    }
  });

  // Admin toggles source availability (failover demo)
  socket.on('toggle_source_online', async (data) => {
    const source = sources.find(s => s.id === data.sourceId);
    if (!source) return;

    source.online = !source.online;
    logEvent(`Source node ${source.id} toggled ${source.online ? 'ONLINE' : 'OFFLINE'}.`);

    // If source goes offline, trigger failover switching for connected clients
    if (!source.online && source.connected > 0) {
      logEvent(`Source ${source.id} went offline with ${source.connected} active clients. Initializing automatic VTS reallocation...`);
      
      const affectedSessions = await getActiveSessions();
      const affectedClients = affectedSessions.filter(s => s.current_source === source.id);

      for (const clientSession of affectedClients) {
        const cid = clientSession.client_id;
        const now = new Date().toISOString();
        
        // Release old allocation
        source.connected = Math.max(0, source.connected - 1);
        const durationSecs = Math.round((Date.now() - new Date(clientSession.stream_start_time).getTime()) / 1000);
        await releaseSourceAllocation(cid, source.id, now, durationSecs);

        // Find new source
        const newSource = selectBestSource();
        if (newSource) {
          newSource.connected++;
          newSource.totalRequests++;
          
          logEvent(`Failover reallocation: Client ${cid} moved from ${source.id} -> ${newSource.id} (${newSource.type}, Latency: ${newSource.latency} ms).`);
          
          // Update worker info with new source
          const workerInfo = activeWorkers.get(cid);
          if (workerInfo) {
            workerInfo.sourceId = newSource.id;
          }

          // Update DB
          await updateClientSession(cid, 'STREAMING', { current_source: newSource.id });
          await addSourceAllocation(cid, newSource.id, newSource.type, now);
          await logSourceSwitch(cid, source.id, newSource.id, 'Source node offline', now);

          // Alert client socket
          const clientSocketId = activeSessionsMap.get(cid);
          if (clientSocketId) {
            io.to(clientSocketId).emit('source_changed', {
              oldSourceId: source.id,
              newSourceId: newSource.id,
              newSourceType: newSource.type,
              latency: newSource.latency,
              switchTime: now,
              reason: 'Source server became unavailable'
            });
          }
        } else {
          // Fail the client session
          logEvent(`Failover reallocation failed: No online backup sources available for ${cid}. Terminating stream.`);
          await updateClientSession(cid, 'FAILED', { disconnect_time: now });
          
          const workerInfo = activeWorkers.get(cid);
          if (workerInfo && workerInfo.worker) {
            workerInfo.worker.terminate();
            activeWorkers.delete(cid);
          }

          const clientSocketId = activeSessionsMap.get(cid);
          if (clientSocketId) {
            io.to(clientSocketId).emit('stream_error', { message: 'Stream lost: Source became unavailable and no fallback nodes are online.' });
          }
        }
      }
    }

    io.to('admins').emit('source_update', sources);
    io.to('admins').emit('client_list_update', await getAllSessions());
    io.to('admins').emit('switches_update', (await getSourceSwitches()).slice(0, 15));
    io.to('admins').emit('history_update', (await getSourceAllocationHistory()).slice(0, 15));
    io.to('admins').emit('metrics_update', await getPerformanceMetrics());
    io.to('admins').emit('thread_list_update', getActiveThreadsData());
    io.to('admins').emit('thread_metrics_update', getMultithreadingMetrics());
  });

  // Client manually disconnects watch session
  socket.on('disconnect_stream', async () => {
    if (!clientSessionId) return;
    await handleClientDisconnect(clientSessionId);
  });

  // Handle Socket Disconnect
  socket.on('disconnect', async () => {
    if (clientSessionId) {
      await handleClientDisconnect(clientSessionId);
      activeSessionsMap.delete(clientSessionId);
    }
  });
});

async function handleCompletedWorker(clientId, threadId, sourceId, execTime) {
  console.log('\n============================================================');
  console.log(`[WORKER COMPLETED]`);
  console.log(`Thread ID: ${threadId}`);
  console.log(`Client: ${clientId}`);
  console.log(`Source: ${sourceId}`);
  console.log(`Execution Time: ${execTime} ms`);
  console.log('============================================================\n');

  multithreadingMetrics.completed++;
  multithreadingMetrics.totalExecutionTimeMs += execTime;
  if (execTime > multithreadingMetrics.longestExecutionTimeMs) {
    multithreadingMetrics.longestExecutionTimeMs = execTime;
  }

  logEvent(`Worker Thread ${threadId} completed for ${clientId} in ${execTime}ms`);
}

async function handleClientDisconnect(clientId) {
  const workerInfo = activeWorkers.get(clientId);
  if (workerInfo && workerInfo.worker) {
    const execTime = Date.now() - workerInfo.startTime;
    workerInfo.worker.terminate();
    console.log(`[MAIN THREAD] Terminated Worker Thread ${workerInfo.threadId} for disconnected client ${clientId}. (Runtime: ${execTime}ms)`);
    
    multithreadingMetrics.completed++;
    multithreadingMetrics.totalExecutionTimeMs += execTime;
    if (execTime > multithreadingMetrics.longestExecutionTimeMs) {
      multithreadingMetrics.longestExecutionTimeMs = execTime;
    }
    
    activeWorkers.delete(clientId);
    printActiveWorkersSummary();
  }

  const session = await getClientSession(clientId);
  if (session && (session.status === 'STREAMING' || session.status === 'REQUESTING')) {
    const finalSource = sources.find(s => s.id === session.current_source);
    if (finalSource) {
      finalSource.connected = Math.max(0, finalSource.connected - 1);
    }
    const nowStr = new Date().toISOString();
    let durationSecs = 0;
    if (session.stream_start_time) {
      durationSecs = Math.round((Date.now() - new Date(session.stream_start_time).getTime()) / 1000);
      await releaseSourceAllocation(clientId, session.current_source, nowStr, durationSecs);
    }
    
    await updateClientSession(clientId, 'DISCONNECTED', { disconnect_time: nowStr });
    logEvent(`Client disconnected: ${clientId}. Stream duration: ${durationSecs}s`);

    io.to('admins').emit('source_update', sources);
    io.to('admins').emit('client_list_update', await getAllSessions());
    io.to('admins').emit('history_update', (await getSourceAllocationHistory()).slice(0, 15));
    io.to('admins').emit('metrics_update', await getPerformanceMetrics());
    io.to('admins').emit('thread_list_update', getActiveThreadsData());
    io.to('admins').emit('thread_metrics_update', getMultithreadingMetrics());
  }
}

// ============================================================
// DEADLOCK DEMONSTRATION WORKSPACE
// ============================================================

const resourceLocks = {
  'Peer-1': { lockedBy: null },
  'Edge-1': { lockedBy: null }
};

let deadlockActiveSimulations = {};

io.on('connection', (socket) => {
  // Trigger deadlock simulation (unsafe)
  socket.on('deadlock_trigger_unsafe', () => {
    logEvent('Starting UN-SAFE deadlock simulation (Circular Wait)...');
    
    // Clear lock states
    resourceLocks['Peer-1'].lockedBy = null;
    resourceLocks['Edge-1'].lockedBy = null;
    deadlockActiveSimulations = {
      'Worker-1': { state: 'IDLE', holds: null, waitsFor: null },
      'Worker-2': { state: 'IDLE', holds: null, waitsFor: null }
    };
    
    io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

    // Worker 1 tries Peer-1, then Edge-1
    setTimeout(() => {
      // Acquire Peer-1
      resourceLocks['Peer-1'].lockedBy = 'Worker-1';
      deadlockActiveSimulations['Worker-1'] = { state: 'LOCKING_PEER1', holds: 'Peer-1', waitsFor: null };
      logEvent('[Deadlock Sim] Worker-1 locked resource: Peer-1');
      io.to('admins').emit('deadlock_status', deadlockActiveSimulations);
      
      // Delay before requesting Edge-1 to allow Worker-2 to acquire it
      setTimeout(() => {
        deadlockActiveSimulations['Worker-1'].state = 'WAITING_EDGE1';
        deadlockActiveSimulations['Worker-1'].waitsFor = 'Edge-1';
        logEvent('[Deadlock Sim] Worker-1 blocks -> Waiting for Edge-1 (held by Worker-2)');
        io.to('admins').emit('deadlock_status', deadlockActiveSimulations);
        
        // Detect Deadlock
        checkForDeadlock();
      }, 1000);
    }, 100);

    // Worker 2 tries Edge-1, then Peer-1
    setTimeout(() => {
      // Acquire Edge-1
      resourceLocks['Edge-1'].lockedBy = 'Worker-2';
      deadlockActiveSimulations['Worker-2'] = { state: 'LOCKING_EDGE1', holds: 'Edge-1', waitsFor: null };
      logEvent('[Deadlock Sim] Worker-2 locked resource: Edge-1');
      io.to('admins').emit('deadlock_status', deadlockActiveSimulations);
      
      // Delay before requesting Peer-1 to allow Worker-1 to acquire it
      setTimeout(() => {
        deadlockActiveSimulations['Worker-2'].state = 'WAITING_PEER1';
        deadlockActiveSimulations['Worker-2'].waitsFor = 'Peer-1';
        logEvent('[Deadlock Sim] Worker-2 blocks -> Waiting for Peer-1 (held by Worker-1)');
        io.to('admins').emit('deadlock_status', deadlockActiveSimulations);
        
        // Detect Deadlock
        checkForDeadlock();
      }, 1000);
    }, 200);
  });

  // Trigger safe simulation with resource ordering
  socket.on('deadlock_trigger_safe_ordering', () => {
    logEvent('Starting SAFE deadlock simulation (Resource Ordering: Peer-1 -> Edge-1)...');
    
    resourceLocks['Peer-1'].lockedBy = null;
    resourceLocks['Edge-1'].lockedBy = null;
    deadlockActiveSimulations = {
      'Worker-1': { state: 'IDLE', holds: null, waitsFor: null },
      'Worker-2': { state: 'IDLE', holds: null, waitsFor: null }
    };
    
    io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

    // Worker 1 acquires Peer-1, then Edge-1
    setTimeout(() => {
      // Lock Peer-1
      resourceLocks['Peer-1'].lockedBy = 'Worker-1';
      deadlockActiveSimulations['Worker-1'] = { state: 'LOCKING_PEER1', holds: 'Peer-1', waitsFor: null };
      logEvent('[Safe Sim Ordering] Worker-1 locked Peer-1');
      io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

      setTimeout(() => {
        // Lock Edge-1
        resourceLocks['Edge-1'].lockedBy = 'Worker-1';
        deadlockActiveSimulations['Worker-1'] = { state: 'LOCKING_EDGE1', holds: 'Peer-1 & Edge-1', waitsFor: null };
        logEvent('[Safe Sim Ordering] Worker-1 locked Edge-1. Processing...');
        io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

        setTimeout(() => {
          // Release both
          resourceLocks['Peer-1'].lockedBy = null;
          resourceLocks['Edge-1'].lockedBy = null;
          deadlockActiveSimulations['Worker-1'] = { state: 'COMPLETED', holds: null, waitsFor: null };
          logEvent('[Safe Sim Ordering] Worker-1 released all resources.');
          io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

          // Worker-2 can now start
          startWorker2SafeOrdering();
        }, 1500);
      }, 1000);
    }, 100);

    function startWorker2SafeOrdering() {
      // Worker 2 must acquire Peer-1 FIRST (resource ordering), preventing deadlock
      deadlockActiveSimulations['Worker-2'].state = 'LOCKING_PEER1';
      resourceLocks['Peer-1'].lockedBy = 'Worker-2';
      deadlockActiveSimulations['Worker-2'].holds = 'Peer-1';
      logEvent('[Safe Sim Ordering] Worker-2 locked Peer-1');
      io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

      setTimeout(() => {
        // Lock Edge-1
        resourceLocks['Edge-1'].lockedBy = 'Worker-2';
        deadlockActiveSimulations['Worker-2'] = { state: 'LOCKING_EDGE1', holds: 'Peer-1 & Edge-1', waitsFor: null };
        logEvent('[Safe Sim Ordering] Worker-2 locked Edge-1. Processing...');
        io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

        setTimeout(() => {
          // Release both
          resourceLocks['Peer-1'].lockedBy = null;
          resourceLocks['Edge-1'].lockedBy = null;
          deadlockActiveSimulations['Worker-2'] = { state: 'COMPLETED', holds: null, waitsFor: null };
          logEvent('[Safe Sim Ordering] Worker-2 completed safely and released all resources.');
          io.to('admins').emit('deadlock_status', deadlockActiveSimulations);
        }, 1500);
      }, 1000);
    }
  });

  // Trigger safe simulation with timeouts
  socket.on('deadlock_trigger_safe_timeout', () => {
    logEvent('Starting SAFE deadlock simulation (Timeout-based Locking)...');
    
    resourceLocks['Peer-1'].lockedBy = null;
    resourceLocks['Edge-1'].lockedBy = null;
    deadlockActiveSimulations = {
      'Worker-1': { state: 'IDLE', holds: null, waitsFor: null },
      'Worker-2': { state: 'IDLE', holds: null, waitsFor: null }
    };
    
    io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

    // Worker 1 acquires Peer-1, then tries Edge-1. If unable in 1.5s, releases Peer-1.
    setTimeout(() => {
      resourceLocks['Peer-1'].lockedBy = 'Worker-1';
      deadlockActiveSimulations['Worker-1'] = { state: 'LOCKING_PEER1', holds: 'Peer-1', waitsFor: null };
      logEvent('[Safe Sim Timeout] Worker-1 locked Peer-1');
      io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

      setTimeout(() => {
        deadlockActiveSimulations['Worker-1'].state = 'WAITING_EDGE1';
        deadlockActiveSimulations['Worker-1'].waitsFor = 'Edge-1';
        logEvent('[Safe Sim Timeout] Worker-1 waiting for Edge-1...');
        io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

        // Timeout handler
        setTimeout(() => {
          if (resourceLocks['Edge-1'].lockedBy !== 'Worker-1') {
            logEvent('[Safe Sim Timeout] Worker-1 Lock Timeout! Releasing Peer-1 to prevent deadlock.');
            resourceLocks['Peer-1'].lockedBy = null;
            deadlockActiveSimulations['Worker-1'] = { state: 'TIMEOUT_RELEASED', holds: null, waitsFor: null };
            io.to('admins').emit('deadlock_status', deadlockActiveSimulations);
            
            // Allow Worker-2 to finish
            setTimeout(() => {
              if (resourceLocks['Peer-1'].lockedBy === null) {
                resourceLocks['Peer-1'].lockedBy = 'Worker-2';
                deadlockActiveSimulations['Worker-2'].holds = 'Edge-1 & Peer-1';
                deadlockActiveSimulations['Worker-2'].state = 'LOCKING_PEER1';
                deadlockActiveSimulations['Worker-2'].waitsFor = null;
                logEvent('[Safe Sim Timeout] Worker-2 acquired Peer-1. Processing...');
                io.to('admins').emit('deadlock_status', deadlockActiveSimulations);
                
                setTimeout(() => {
                  resourceLocks['Peer-1'].lockedBy = null;
                  resourceLocks['Edge-1'].lockedBy = null;
                  deadlockActiveSimulations['Worker-2'] = { state: 'COMPLETED', holds: null, waitsFor: null };
                  logEvent('[Safe Sim Timeout] Worker-2 completed and released locks.');
                  io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

                  // Now Worker-1 retries and completes
                  retryWorker1();
                }, 1000);
              }
            }, 500);
          }
        }, 1500);
      }, 1000);
    }, 100);

    // Worker 2 acquires Edge-1, then Peer-1.
    setTimeout(() => {
      resourceLocks['Edge-1'].lockedBy = 'Worker-2';
      deadlockActiveSimulations['Worker-2'] = { state: 'LOCKING_EDGE1', holds: 'Edge-1', waitsFor: null };
      logEvent('[Safe Sim Timeout] Worker-2 locked Edge-1');
      io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

      setTimeout(() => {
        deadlockActiveSimulations['Worker-2'].state = 'WAITING_PEER1';
        deadlockActiveSimulations['Worker-2'].waitsFor = 'Peer-1';
        logEvent('[Safe Sim Timeout] Worker-2 waiting for Peer-1...');
        io.to('admins').emit('deadlock_status', deadlockActiveSimulations);
      }, 1000);
    }, 200);

    function retryWorker1() {
      logEvent('[Safe Sim Timeout] Worker-1 retrying lock acquisition...');
      resourceLocks['Peer-1'].lockedBy = 'Worker-1';
      deadlockActiveSimulations['Worker-1'] = { state: 'LOCKING_PEER1', holds: 'Peer-1', waitsFor: null };
      io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

      setTimeout(() => {
        resourceLocks['Edge-1'].lockedBy = 'Worker-1';
        deadlockActiveSimulations['Worker-1'].holds = 'Peer-1 & Edge-1';
        deadlockActiveSimulations['Worker-1'].state = 'LOCKING_EDGE1';
        logEvent('[Safe Sim Timeout] Worker-1 acquired Edge-1. Processing...');
        io.to('admins').emit('deadlock_status', deadlockActiveSimulations);

        setTimeout(() => {
          resourceLocks['Peer-1'].lockedBy = null;
          resourceLocks['Edge-1'].lockedBy = null;
          deadlockActiveSimulations['Worker-1'] = { state: 'COMPLETED', holds: null, waitsFor: null };
          logEvent('[Safe Sim Timeout] Worker-1 completed and released all resources.');
          io.to('admins').emit('deadlock_status', deadlockActiveSimulations);
        }, 1000);
      }, 1000);
    }
  });

  socket.on('deadlock_reset', () => {
    resourceLocks['Peer-1'].lockedBy = null;
    resourceLocks['Edge-1'].lockedBy = null;
    deadlockActiveSimulations = {};
    logEvent('[Deadlock Sim] Reset completed.');
    io.to('admins').emit('deadlock_status', deadlockActiveSimulations);
  });
});

function checkForDeadlock() {
  const w1 = deadlockActiveSimulations['Worker-1'];
  const w2 = deadlockActiveSimulations['Worker-2'];

  if (w1 && w2 && 
      w1.waitsFor === 'Edge-1' && resourceLocks['Edge-1'].lockedBy === 'Worker-2' &&
      w2.waitsFor === 'Peer-1' && resourceLocks['Peer-1'].lockedBy === 'Worker-1') {
    
    // Circular Wait Detected
    logEvent('WARNING: DEADLOCK DETECTED! Circular wait condition identified between Worker-1 and Worker-2.');
    io.to('admins').emit('deadlock_detected', {
      workers: deadlockActiveSimulations,
      resources: resourceLocks
    });
  }
}

// ============================================================
// INITIALIZE & START
// ============================================================

if (!process.env.VERCEL) {
  initDB().then(() => {
    logEvent('Database initialized successfully.');
    server.listen(PORT, '0.0.0.0', () => {
      console.log();
      console.log('============================================================');
      console.log('  ALIVE Hybrid P2P-CDN Video Streaming System Backend started');
      console.log('============================================================');
      console.log(`  Express server running on: http://localhost:${PORT}`);
      console.log(`  Max Upload File Size: 1 GB (1024 MB)`);
      console.log(`  Multithreading Engine: Node.js worker_threads Enabled`);
      console.log(`  HTTP 206 Range Stream: /video/:filename Enabled`);
      console.log('============================================================');
      console.log();
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
  });
}

export default app;
