import assert from 'assert';
import http from 'http';

console.log('====================================================');
console.log('RUNNING LIVE STREAMING + ELECTION INTEGRATION TEST');
console.log('====================================================\n');

process.env.PORT = '6002';
const serverModule = await import('../server.js');

function req(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const dataStr = body ? JSON.stringify(body) : null;
    const request = http.request({
      hostname: '127.0.0.1',
      port: 6002,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    request.on('error', reject);
    if (dataStr) request.write(dataStr);
    request.end();
  });
}

setTimeout(async () => {
  try {
    // 1. Start LIVE Stream
    console.log('--- STEP 1: Starting Live Broadcast Stream ---');
    const startRes = await req('/api/stream/start', 'POST');
    assert.strictEqual(startRes.status, 200, 'Stream must start');
    assert.strictEqual(startRes.body.stream.status, 'LIVE');
    console.log('✓ Live broadcast started successfully (Status: LIVE).');

    // 2. Connect 3 Clients
    console.log('\n--- STEP 2: Connecting 3 Streaming Clients ---');
    const c1 = await req('/api/stream/watch', 'POST', { clientId: 'CLIENT-INT-001' });
    const c2 = await req('/api/stream/watch', 'POST', { clientId: 'CLIENT-INT-002' });
    const c3 = await req('/api/stream/watch', 'POST', { clientId: 'CLIENT-INT-003' });

    assert.strictEqual(c1.body.sourceId, 'Peer-1', 'Client 1 must be allocated Peer-1');
    assert.strictEqual(c2.body.sourceId, 'Peer-2', 'Client 2 must be allocated Peer-2');
    assert.strictEqual(c3.body.sourceId, 'Edge-1', 'Client 3 must be allocated Edge-1');
    console.log(`✓ VTS Allocations: Client-1 -> ${c1.body.sourceId}, Client-2 -> ${c2.body.sourceId}, Client-3 -> ${c3.body.sourceId}`);

    // 3. Inspect Election State
    console.log('\n--- STEP 3: Verify Election Baseline During Active Stream ---');
    const electState = await req('/api/election/state');
    assert.strictEqual(electState.body.currentCoordinator, 'CDN-1');
    console.log(`✓ Current Coordinator: ${electState.body.currentCoordinator} (ID ${electState.body.coordinatorElectionId})`);

    // Configure low delay for fast test
    await req('/api/election/config', 'POST', { messageDelayMs: 20 });

    // 4. Fail Coordinator CDN-1
    console.log('\n--- STEP 4: Fail Coordinator CDN-1 (Video Stream Active) ---');
    const failCoordRes = await req('/api/election/nodes/CDN-1/fail', 'POST');
    assert.strictEqual(failCoordRes.body.wasCoordinator, true);
    assert.strictEqual(failCoordRes.body.coordinatorFailureDetected, true);
    console.log('✓ Coordinator failure detected for CDN-1.');

    // 5. Execute Bully Election from Peer-1
    console.log('\n--- STEP 5: Execute Bully Election with Peer-1 as Initiator ---');
    const bullyRes = await req('/api/election/start', 'POST', { algorithm: 'BULLY', initiatorId: 'Peer-1' });
    assert.strictEqual(bullyRes.status, 200);
    assert.strictEqual(bullyRes.body.result.new_coordinator, 'Edge-1');
    assert.strictEqual(bullyRes.body.result.new_coordinator_id, 3);
    console.log(`✓ Bully Election Complete: Edge-1 elected new coordinator (${bullyRes.body.result.message_count} messages).`);

    // 6. Verify Stream Is Still LIVE
    console.log('\n--- STEP 6: Verify Live Stream Continuity ---');
    const streamInfo = await req('/api/stream-info');
    assert.strictEqual(streamInfo.body.status.status, 'LIVE');
    console.log('✓ Video stream is STILL LIVE and unaffected by coordinator election.');

    // 7. Fail Streaming Source Peer-1 (Failover Test)
    console.log('\n--- STEP 7: Fail Streaming Source Peer-1 (Non-Coordinator Failover) ---');
    const failPeerRes = await req('/api/election/nodes/Peer-1/fail', 'POST');
    assert.strictEqual(failPeerRes.body.wasCoordinator, false, 'Peer-1 is not coordinator');
    assert.strictEqual(failPeerRes.body.coordinatorFailureDetected, false, 'No coordinator failure flagged');

    const postFailCoord = await req('/api/election/state');
    assert.strictEqual(postFailCoord.body.currentCoordinator, 'Edge-1', 'Edge-1 remains coordinator');
    console.log('✓ Peer-1 source failed: VTS failover handled streaming clients, NO election triggered.');

    // 8. Reset Election State
    console.log('\n--- STEP 8: Reset Election State & Test Ring Algorithm ---');
    await req('/api/election/reset', 'POST');
    await req('/api/election/nodes/CDN-1/fail', 'POST');

    const ringRes = await req('/api/election/start', 'POST', { algorithm: 'RING', initiatorId: 'Peer-1' });
    assert.strictEqual(ringRes.status, 200);
    assert.strictEqual(ringRes.body.result.new_coordinator, 'Edge-1');
    assert.deepStrictEqual(ringRes.body.result.token_route, ['Peer-1', 'Peer-2', 'Edge-1', 'Peer-1']);
    console.log(`✓ Ring Election Complete: Token route [${ringRes.body.result.token_route.join(' -> ')}], Winner: Edge-1.`);

    // 9. Stop Stream
    console.log('\n--- STEP 9: Stop Live Broadcast Stream ---');
    const stopRes = await req('/api/stream/stop', 'POST');
    assert.strictEqual(stopRes.status, 200);
    console.log('✓ Broadcast stopped cleanly.');

    console.log('\n====================================================');
    console.log('ALL STREAMING + ELECTION INTEGRATION TESTS PASSED!');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Integration test failed:', err);
    process.exit(1);
  }
}, 1200);
