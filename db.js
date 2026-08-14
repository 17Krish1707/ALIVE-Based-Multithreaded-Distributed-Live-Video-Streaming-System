import path from 'path';
import os from 'os';

let db = null;
let dbInitialized = false;
let dbInitPromise = null;

// In-Memory Data Store (Failsafe for serverless platforms like Vercel)
const memStore = {
  videos: [
    {
      id: 1,
      filename: 'sample_live_video.mp4',
      filepath: 'sample_live_video.mp4',
      size: 788493,
      duration: 30,
      uploaded_at: new Date().toISOString()
    }
  ],
  streamStatus: {
    id: 1,
    status: 'OFFLINE',
    started_at: null,
    video_id: null
  },
  clientSessions: new Map(),
  sourceAllocations: [],
  sourceSwitches: []
};

export async function initDB() {
  try {
    if (process.env.VERCEL) {
      console.log('[DB] Running on Vercel: In-Memory Data Layer active.');
      db = null;
      return null;
    }

    const sqlite3Module = await import('sqlite3');
    const sqliteModule = await import('sqlite');
    const sqlite3 = sqlite3Module.default || sqlite3Module;
    const open = sqliteModule.open;

    const dbPath = path.join(process.cwd(), 'database.db');

    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Create tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        size INTEGER NOT NULL,
        duration REAL,
        uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS stream_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL,
        started_at TEXT,
        video_id INTEGER,
        FOREIGN KEY(video_id) REFERENCES videos(id)
      );

      CREATE TABLE IF NOT EXISTS client_sessions (
        client_id TEXT PRIMARY KEY,
        ip_address TEXT,
        browser TEXT,
        os TEXT,
        request_time TEXT,
        allocation_time TEXT,
        stream_start_time TEXT,
        disconnect_time TEXT,
        status TEXT,
        current_source TEXT,
        processing_time_ms INTEGER
      );

      CREATE TABLE IF NOT EXISTS source_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT,
        source_id TEXT,
        source_type TEXT,
        allocated_at TEXT,
        released_at TEXT,
        duration_seconds INTEGER
      );

      CREATE TABLE IF NOT EXISTS source_switches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT,
        old_source_id TEXT,
        new_source_id TEXT,
        switch_time TEXT,
        reason TEXT
      );
    `);

    // Initialize stream status if not exists
    const statusRow = await db.get('SELECT * FROM stream_status LIMIT 1');
    if (!statusRow) {
      await db.run("INSERT INTO stream_status (status, started_at, video_id) VALUES ('OFFLINE', NULL, NULL)");
    }

    // Clear previous active client sessions on restart to ensure clean logs
    await db.run("UPDATE client_sessions SET status = 'DISCONNECTED', disconnect_time = ? WHERE status NOT IN ('DISCONNECTED', 'COMPLETED', 'FAILED')", [new Date().toISOString()]);

    return db;
  } catch (err) {
    console.warn('[DB] Native SQLite initialization notice, using In-Memory Store fallback:', err.message);
    db = null;
    return null;
  }
}

export async function ensureDB() {
  if (!dbInitialized) {
    if (!dbInitPromise) {
      dbInitPromise = initDB().then(() => {
        dbInitialized = true;
      }).catch(() => {
        dbInitialized = true;
      });
    }
    await dbInitPromise;
  }
  return db;
}

export async function saveVideo(filename, filepath, size, duration) {
  if (db) {
    try {
      const result = await db.run(
        'INSERT INTO videos (filename, filepath, size, duration) VALUES (?, ?, ?, ?)',
        [filename, filepath, size, duration]
      );
      return result.lastID;
    } catch (e) {
      console.warn('[DB] saveVideo fallback:', e.message);
    }
  }
  const id = memStore.videos.length + 1;
  memStore.videos.push({
    id,
    filename,
    filepath,
    size: Number(size) || 0,
    duration: Number(duration) || 0,
    uploaded_at: new Date().toISOString()
  });
  return id;
}

export async function getLatestVideo() {
  if (db) {
    try {
      const res = await db.get('SELECT * FROM videos ORDER BY id DESC LIMIT 1');
      if (res) return res;
    } catch (e) {}
  }
  if (memStore.videos.length === 0) return null;
  return memStore.videos[memStore.videos.length - 1];
}

export async function startLiveStream(videoId) {
  const now = new Date().toISOString();
  if (db) {
    try {
      await db.run(
        'UPDATE stream_status SET status = ?, started_at = ?, video_id = ? WHERE id = 1',
        ['LIVE', now, videoId]
      );
      return now;
    } catch (e) {}
  }
  memStore.streamStatus = {
    id: 1,
    status: 'LIVE',
    started_at: now,
    video_id: videoId
  };
  return now;
}

export async function stopLiveStream() {
  if (db) {
    try {
      await db.run(
        "UPDATE stream_status SET status = 'OFFLINE', started_at = NULL, video_id = NULL WHERE id = 1"
      );
      return;
    } catch (e) {}
  }
  memStore.streamStatus = {
    id: 1,
    status: 'OFFLINE',
    started_at: null,
    video_id: null
  };
}

export async function getStreamStatus() {
  let res = null;
  if (db) {
    try {
      res = await db.get(`
        SELECT s.status, s.started_at, s.video_id, v.filename, v.filepath, v.size, v.duration 
        FROM stream_status s
        LEFT JOIN videos v ON s.video_id = v.id
        WHERE s.id = 1
      `);
      if (res && !res.filename) {
        const latest = await db.get('SELECT * FROM videos ORDER BY id DESC LIMIT 1');
        if (latest) {
          res.latest_video_id = latest.id;
          res.filename = latest.filename;
          res.filepath = latest.filepath;
          res.size = latest.size;
          res.duration = latest.duration;
        }
      }
      if (res) return res;
    } catch (e) {}
  }
  const s = memStore.streamStatus;
  const v = s.video_id ? memStore.videos.find(item => item.id === s.video_id) : (memStore.videos[memStore.videos.length - 1] || null);
  return {
    status: s.status || 'OFFLINE',
    started_at: s.started_at,
    video_id: s.video_id,
    latest_video_id: v ? v.id : null,
    filename: v ? v.filename : (memStore.videos[0]?.filename || null),
    filepath: v ? v.filepath : (memStore.videos[0]?.filepath || null),
    size: v ? v.size : (memStore.videos[0]?.size || null),
    duration: v ? v.duration : (memStore.videos[0]?.duration || null)
  };
}

export async function getVideoRecord(identifier) {
  if (db) {
    try {
      const rec = await db.get(
        'SELECT * FROM videos WHERE filename = ? OR filepath = ? ORDER BY id DESC LIMIT 1',
        [identifier, identifier]
      );
      if (rec) return rec;
    } catch (e) {}
  }
  const found = memStore.videos.find(v => v.filename === identifier || v.filepath === identifier);
  return found || (memStore.videos.length > 0 ? memStore.videos[memStore.videos.length - 1] : null);
}

export async function createClientSession(clientId, ip, browser, os) {
  if (db) {
    try {
      await db.run(
        'INSERT OR REPLACE INTO client_sessions (client_id, ip_address, browser, os, status) VALUES (?, ?, ?, ?, ?)',
        [clientId, ip, browser, os, 'CONNECTED']
      );
      return;
    } catch (e) {}
  }
  memStore.clientSessions.set(clientId, {
    client_id: clientId,
    ip_address: ip,
    browser,
    os,
    status: 'CONNECTED',
    request_time: null,
    allocation_time: null,
    stream_start_time: null,
    disconnect_time: null,
    current_source: null,
    processing_time_ms: 0
  });
}

export async function updateClientSession(clientId, status, updates = {}) {
  if (db) {
    try {
      const fields = ['status = ?'];
      const params = [status];
      if (updates.request_time) { fields.push('request_time = ?'); params.push(updates.request_time); }
      if (updates.allocation_time) { fields.push('allocation_time = ?'); params.push(updates.allocation_time); }
      if (updates.stream_start_time) { fields.push('stream_start_time = ?'); params.push(updates.stream_start_time); }
      if (updates.disconnect_time) { fields.push('disconnect_time = ?'); params.push(updates.disconnect_time); }
      if (updates.current_source) { fields.push('current_source = ?'); params.push(updates.current_source); }
      if (updates.processing_time_ms !== undefined) { fields.push('processing_time_ms = ?'); params.push(updates.processing_time_ms); }
      params.push(clientId);
      await db.run(`UPDATE client_sessions SET ${fields.join(', ')} WHERE client_id = ?`, params);
      return;
    } catch (e) {}
  }
  const session = memStore.clientSessions.get(clientId) || { client_id: clientId };
  session.status = status;
  Object.assign(session, updates);
  memStore.clientSessions.set(clientId, session);
}

export async function getClientSession(clientId) {
  if (db) {
    try {
      return await db.get('SELECT * FROM client_sessions WHERE client_id = ?', [clientId]);
    } catch (e) {}
  }
  return memStore.clientSessions.get(clientId) || null;
}

export async function getActiveSessions() {
  if (db) {
    try {
      return await db.all("SELECT * FROM client_sessions WHERE status IN ('CONNECTED', 'REQUESTING', 'ALLOCATED', 'STREAMING')");
    } catch (e) {}
  }
  return Array.from(memStore.clientSessions.values()).filter(s => ['CONNECTED', 'REQUESTING', 'ALLOCATED', 'STREAMING'].includes(s.status));
}

export async function getAllSessions() {
  if (db) {
    try {
      return await db.all("SELECT * FROM client_sessions ORDER BY request_time DESC");
    } catch (e) {}
  }
  return Array.from(memStore.clientSessions.values());
}

export async function addSourceAllocation(clientId, sourceId, sourceType, allocatedAt) {
  if (db) {
    try {
      await db.run(
        'INSERT INTO source_allocations (client_id, source_id, source_type, allocated_at, released_at, duration_seconds) VALUES (?, ?, ?, ?, NULL, NULL)',
        [clientId, sourceId, sourceType, allocatedAt]
      );
      return;
    } catch (e) {}
  }
  memStore.sourceAllocations.unshift({
    id: memStore.sourceAllocations.length + 1,
    client_id: clientId,
    source_id: sourceId,
    source_type: sourceType,
    allocated_at: allocatedAt,
    released_at: null,
    duration_seconds: null
  });
}

export async function releaseSourceAllocation(clientId, sourceId, releasedAt, durationSeconds) {
  if (db) {
    try {
      await db.run(
        'UPDATE source_allocations SET released_at = ?, duration_seconds = ? WHERE client_id = ? AND source_id = ? AND released_at IS NULL',
        [releasedAt, durationSeconds, clientId, sourceId]
      );
      return;
    } catch (e) {}
  }
  const item = memStore.sourceAllocations.find(a => a.client_id === clientId && a.source_id === sourceId && !a.released_at);
  if (item) {
    item.released_at = releasedAt;
    item.duration_seconds = durationSeconds;
  }
}

export async function logSourceSwitch(clientId, oldSourceId, newSourceId, reason, switchTime) {
  if (db) {
    try {
      await db.run(
        'INSERT INTO source_switches (client_id, old_source_id, new_source_id, reason, switch_time) VALUES (?, ?, ?, ?, ?)',
        [clientId, oldSourceId, newSourceId, reason, switchTime]
      );
      return;
    } catch (e) {}
  }
  memStore.sourceSwitches.unshift({
    id: memStore.sourceSwitches.length + 1,
    client_id: clientId,
    old_source_id: oldSourceId,
    new_source_id: newSourceId,
    reason,
    switch_time: switchTime
  });
}

export async function getSourceSwitches() {
  if (db) {
    try {
      return await db.all("SELECT * FROM source_switches ORDER BY switch_time DESC");
    } catch (e) {}
  }
  return memStore.sourceSwitches;
}

export async function getSourceAllocationHistory() {
  if (db) {
    try {
      return await db.all("SELECT * FROM source_allocations ORDER BY allocated_at DESC");
    } catch (e) {}
  }
  return memStore.sourceAllocations;
}

export async function getPerformanceMetrics() {
  if (db) {
    try {
      const totalClients = await db.get("SELECT COUNT(DISTINCT client_id) as count FROM client_sessions");
      const activeClients = await db.get("SELECT COUNT(*) as count FROM client_sessions WHERE status = 'STREAMING'");
      const completedSessions = await db.get("SELECT COUNT(*) as count FROM client_sessions WHERE status = 'COMPLETED'");
      const totalRequests = await db.get("SELECT COUNT(*) as count FROM client_sessions WHERE request_time IS NOT NULL");
      const avgProcessing = await db.get("SELECT AVG(processing_time_ms) as avg FROM client_sessions WHERE processing_time_ms IS NOT NULL");
      const avgDuration = await db.get("SELECT AVG(duration_seconds) as avg FROM source_allocations WHERE duration_seconds IS NOT NULL");
      const totalSwitches = await db.get("SELECT COUNT(*) as count FROM source_switches");
      const failedRequests = await db.get("SELECT COUNT(*) as count FROM client_sessions WHERE status = 'FAILED'");

      return {
        totalClients: totalClients?.count || 0,
        activeClients: activeClients?.count || 0,
        completedSessions: completedSessions?.count || 0,
        totalRequests: totalRequests?.count || 0,
        avgProcessingTime: Math.round(avgProcessing?.avg || 0),
        avgStreamingDuration: Math.round(avgDuration?.avg || 0),
        sourceSwitches: totalSwitches?.count || 0,
        failedRequests: failedRequests?.count || 0
      };
    } catch (e) {}
  }

  const sessions = Array.from(memStore.clientSessions.values());
  const activeCount = sessions.filter(s => s.status === 'STREAMING').length;
  const completedCount = sessions.filter(s => s.status === 'COMPLETED').length;
  const failedCount = sessions.filter(s => s.status === 'FAILED').length;
  const reqSessions = sessions.filter(s => s.request_time);
  const procTimes = reqSessions.map(s => s.processing_time_ms || 0);
  const avgProc = procTimes.length > 0 ? Math.round(procTimes.reduce((a, b) => a + b, 0) / procTimes.length) : 0;

  return {
    totalClients: sessions.length,
    activeClients: activeCount,
    completedSessions: completedCount,
    totalRequests: reqSessions.length,
    avgProcessingTime: avgProc,
    avgStreamingDuration: 0,
    sourceSwitches: memStore.sourceSwitches.length,
    failedRequests: failedCount
  };
}
