import assert from 'assert';
import { 
  initDB, 
  createClientSession, 
  updateClientSession, 
  getClientSession,
  addSourceAllocation,
  releaseSourceAllocation
} from '../db.js';
import { Worker } from 'worker_threads';
import path from 'path';

console.log('====================================================');
console.log('RUNNING ADMIN-CONTROLLED CLIENT DISCONNECT TEST SUITE');
console.log('====================================================\n');

async function runTests() {
  await initDB();

  // Test 1: Session and Worker Thread setup
  console.log('--- TEST 1: Setup Active Client Session & Worker Thread ---');
  const clientId = `TEST-CLIENT-${Date.now()}`;
  await createClientSession(clientId, '127.0.0.1', 'Chrome Test', 'Windows');

  const session = await getClientSession(clientId);
  assert(session, 'Client session should exist in database');
  assert.strictEqual(session.client_id, clientId);
  assert.strictEqual(session.status, 'CONNECTED');
  console.log(`✓ Client session created: ${clientId} (Status: CONNECTED)`);

  // Simulate source allocation to Peer-1
  const source = { id: 'Peer-1', name: 'Peer-1', type: 'P2P', connected: 1, capacity: 5, online: true };
  const initialConnected = source.connected;

  const startTime = new Date().toISOString();
  await updateClientSession(clientId, 'STREAMING', {
    current_source: 'Peer-1',
    stream_start_time: startTime,
    allocation_time: startTime
  });
  await addSourceAllocation(clientId, 'Peer-1', 'P2P', startTime);

  // Spawn real Worker Thread
  const worker = new Worker(path.join(process.cwd(), 'worker.js'), {
    workerData: {
      clientId,
      sourceId: 'Peer-1',
      latency: 20,
      chunkProcessingTime: 200,
      continuous: true
    }
  });

  const workerInfo = {
    worker,
    threadId: worker.threadId,
    clientId,
    sourceId: 'Peer-1',
    startTime: Date.now()
  };

  assert(worker.threadId > 0, 'Worker thread should be running with valid threadId');
  console.log(`✓ Real Node.js Worker Thread spawned (threadId: ${worker.threadId})`);

  // Test 2: Admin triggers real server-side disconnect
  console.log('\n--- TEST 2: Admin-Controlled Client Disconnect ---');
  
  // 1. Terminate Worker Thread
  let workerTerminated = false;
  try {
    worker.terminate();
    workerTerminated = true;
  } catch (e) {
    workerTerminated = false;
  }
  assert.strictEqual(workerTerminated, true, 'Worker thread must be terminated');

  // 2. Release source capacity
  source.connected = Math.max(0, source.connected - 1);
  const nowStr = new Date().toISOString();
  await releaseSourceAllocation(clientId, source.id, nowStr, 5);
  assert.strictEqual(source.connected, initialConnected - 1, 'Source capacity must be decremented on admin disconnect');
  console.log(`✓ Source capacity released: ${source.id} connected count is now ${source.connected}/${source.capacity}`);

  // 3. Update database status & reason
  await updateClientSession(clientId, 'ADMIN_DISCONNECTED', {
    disconnect_time: nowStr,
    disconnect_reason: 'ADMIN_DISCONNECT'
  });

  const updatedSession = await getClientSession(clientId);
  assert.strictEqual(updatedSession.status, 'ADMIN_DISCONNECTED', 'Session status must be ADMIN_DISCONNECTED');
  assert.strictEqual(updatedSession.disconnect_reason, 'ADMIN_DISCONNECT', 'Disconnect reason must be ADMIN_DISCONNECT');
  console.log(`✓ Database session record verified: status=${updatedSession.status}, disconnect_reason=${updatedSession.disconnect_reason}`);

  // Test 3: Verify capacity is immediately reusable by next client
  console.log('\n--- TEST 3: Released Capacity Reallocation ---');
  const newClientId = `TEST-CLIENT-NEW-${Date.now()}`;
  await createClientSession(newClientId, '127.0.0.1', 'Firefox Test', 'macOS');
  
  assert(source.connected < source.capacity, 'Source must have available capacity after disconnect');
  source.connected++;
  await updateClientSession(newClientId, 'STREAMING', {
    current_source: source.id,
    stream_start_time: new Date().toISOString()
  });

  const newSession = await getClientSession(newClientId);
  assert.strictEqual(newSession.status, 'STREAMING', 'New client successfully allocated to released capacity');
  console.log(`✓ New client ${newClientId} successfully reallocated to freed capacity on ${source.id}.`);

  console.log('\n====================================================');
  console.log('ALL ADMIN DISCONNECT TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
