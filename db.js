import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import os from 'os';

let db;
let dbInitialized = false;
let dbInitPromise = null;

export async function initDB() {
  const dbPath = process.env.VERCEL
    ? path.join(os.tmpdir(), 'database.db')
    : path.join(process.cwd(), 'database.db');

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
}

export async function ensureDB() {
  if (!dbInitialized) {
    if (!dbInitPromise) {
      dbInitPromise = initDB()
        .then(() => {
          dbInitialized = true;
        })
        .catch((err) => {
          dbInitPromise = null;
          console.error('[DB] initDB error:', err);
          throw err;
        });
    }
    await dbInitPromise;
  }
  return db;
}

export async function saveVideo(filename, filepath, size, duration) {
  const result = await db.run(
    'INSERT INTO videos (filename, filepath, size, duration) VALUES (?, ?, ?, ?)',
    [filename, filepath, size, duration]
  );
  return result.lastID;
}

export async function getLatestVideo() {
  return await db.get('SELECT * FROM videos ORDER BY id DESC LIMIT 1');
}

export async function startLiveStream(videoId) {
  const now = new Date().toISOString();
  await db.run(
    'UPDATE stream_status SET status = ?, started_at = ?, video_id = ? WHERE id = 1',
    ['LIVE', now, videoId]
  );
  return now;
}

export async function stopLiveStream() {
  await db.run(
    "UPDATE stream_status SET status = 'OFFLINE', started_at = NULL, video_id = NULL WHERE id = 1"
  );
}

export async function getStreamStatus() {
  return await db.get(`
    SELECT s.status, s.started_at, s.video_id, v.filename, v.filepath, v.size, v.duration 
    FROM stream_status s
    LEFT JOIN videos v ON s.video_id = v.id
    WHERE s.id = 1
  `);
}

export async function getVideoRecord(identifier) {
  if (!db) return null;
  return await db.get(
    'SELECT * FROM videos WHERE filename = ? OR filepath = ? ORDER BY id DESC LIMIT 1',
    [identifier, identifier]
  );
}


export async function createClientSession(clientId, ip, browser, os) {
  await db.run(
    'INSERT OR REPLACE INTO client_sessions (client_id, ip_address, browser, os, status) VALUES (?, ?, ?, ?, ?)',
    [clientId, ip, browser, os, 'CONNECTED']
  );
}

export async function updateClientSession(clientId, status, updates = {}) {
  const fields = ['status = ?'];
  const params = [status];

  if (updates.request_time) {
    fields.push('request_time = ?');
    params.push(updates.request_time);
  }
  if (updates.allocation_time) {
    fields.push('allocation_time = ?');
    params.push(updates.allocation_time);
  }
  if (updates.stream_start_time) {
    fields.push('stream_start_time = ?');
    params.push(updates.stream_start_time);
  }
  if (updates.disconnect_time) {
    fields.push('disconnect_time = ?');
    params.push(updates.disconnect_time);
  }
  if (updates.current_source) {
    fields.push('current_source = ?');
    params.push(updates.current_source);
  }
  if (updates.processing_time_ms !== undefined) {
    fields.push('processing_time_ms = ?');
    params.push(updates.processing_time_ms);
  }

  params.push(clientId);
  await db.run(
    `UPDATE client_sessions SET ${fields.join(', ')} WHERE client_id = ?`,
    params
  );
}

export async function getClientSession(clientId) {
  return await db.get('SELECT * FROM client_sessions WHERE client_id = ?', [clientId]);
}

export async function getActiveSessions() {
  return await db.all("SELECT * FROM client_sessions WHERE status IN ('CONNECTED', 'REQUESTING', 'ALLOCATED', 'STREAMING')");
}

export async function getAllSessions() {
  return await db.all("SELECT * FROM client_sessions ORDER BY request_time DESC");
}

export async function addSourceAllocation(clientId, sourceId, sourceType, allocatedAt) {
  await db.run(
    'INSERT INTO source_allocations (client_id, source_id, source_type, allocated_at, released_at, duration_seconds) VALUES (?, ?, ?, ?, NULL, NULL)',
    [clientId, sourceId, sourceType, allocatedAt]
  );
}

export async function releaseSourceAllocation(clientId, sourceId, releasedAt, durationSeconds) {
  await db.run(
    'UPDATE source_allocations SET released_at = ?, duration_seconds = ? WHERE client_id = ? AND source_id = ? AND released_at IS NULL',
    [releasedAt, durationSeconds, clientId, sourceId]
  );
}

export async function logSourceSwitch(clientId, oldSourceId, newSourceId, reason, switchTime) {
  await db.run(
    'INSERT INTO source_switches (client_id, old_source_id, new_source_id, reason, switch_time) VALUES (?, ?, ?, ?, ?)',
    [clientId, oldSourceId, newSourceId, reason, switchTime]
  );
}

export async function getSourceSwitches() {
  return await db.all("SELECT * FROM source_switches ORDER BY switch_time DESC");
}

export async function getSourceAllocationHistory() {
  return await db.all("SELECT * FROM source_allocations ORDER BY allocated_at DESC");
}

export async function getPerformanceMetrics() {
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
}
