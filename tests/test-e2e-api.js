import assert from 'assert';
import http from 'http';

console.log('====================================================');
console.log('RUNNING REST API & INTEGRATION TEST SUITE');
console.log('====================================================\n');

// Import server (starts HTTP server on PORT or 6000)
process.env.PORT = '6001'; // Use port 6001 for test
const serverModule = await import('../server.js');

function req(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const dataStr = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: 6001,
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
    req.on('error', reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

// Wait 1 second for server to initialize
setTimeout(async () => {
  try {
    console.log('--- TEST 1: GET /api/clock/state ---');
    const resState = await req('/api/clock/state');
    assert.strictEqual(resState.status, 200);
    assert.strictEqual(resState.body.nodes.length, 5);
    console.log('✓ GET /api/clock/state returned 5 nodes successfully.');

    console.log('\n--- TEST 2: POST /api/clock/cristian/run ---');
    const resCristian = await req('/api/clock/cristian/run', 'POST', { targetNodeId: 'Peer-1' });
    assert.strictEqual(resCristian.status, 200);
    assert(resCristian.body.result.rtt >= 0);
    assert.strictEqual(resCristian.body.result.targetNodeId, 'Peer-1');
    console.log(`✓ POST /api/clock/cristian/run returned calculations (RTT: ${resCristian.body.result.rtt}ms, delay: ${resCristian.body.result.estimatedOneWayDelay}ms).`);

    console.log('\n--- TEST 3: POST /api/clock/berkeley/run ---');
    const resBerkeley = await req('/api/clock/berkeley/run', 'POST');
    assert.strictEqual(resBerkeley.status, 200);
    assert.strictEqual(resBerkeley.body.result.coordinator, 'VTS');
    assert.strictEqual(Object.keys(resBerkeley.body.result.adjustments).length, 5);
    console.log('✓ POST /api/clock/berkeley/run calculated consensus average and per-node adjustments.');

    console.log('\n--- TEST 4: POST /api/clock/lamport/event & message ---');
    const resLocal = await req('/api/clock/lamport/event', 'POST', { nodeId: 'Peer-2', eventType: 'BUFFER_CHUNK' });
    assert.strictEqual(resLocal.status, 200);

    const resMsg = await req('/api/clock/lamport/message', 'POST', { senderNodeId: 'Peer-2', receiverNodeId: 'Edge-1', messageType: 'SEND_STREAM_METRICS' });
    assert.strictEqual(resMsg.status, 200);
    console.log('✓ Lamport local event and message endpoints executed with logical counter increments.');

    console.log('\n--- TEST 5: POST /api/clock/step ---');
    const resStep = await req('/api/clock/step', 'POST', { algorithm: 'cristian' });
    assert.strictEqual(resStep.status, 200);
    assert(resStep.body.stepState.currentStep >= 1);
    console.log(`✓ POST /api/clock/step advanced step machine to step ${resStep.body.stepState.currentStep}.`);

    console.log('\n--- TEST 6: POST /api/admin/clients/:clientId/disconnect ---');
    const resDisconnect = await req('/api/admin/clients/TEST-DISCONNECT-123/disconnect', 'POST');
    assert.strictEqual(resDisconnect.status, 200);
    assert.strictEqual(resDisconnect.body.success, true);
    console.log('✓ POST /api/admin/clients/:clientId/disconnect executed successfully.');

    console.log('\n====================================================');
    console.log('ALL E2E REST API TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Integration test failed:', err);
    process.exit(1);
  }
}, 1200);
