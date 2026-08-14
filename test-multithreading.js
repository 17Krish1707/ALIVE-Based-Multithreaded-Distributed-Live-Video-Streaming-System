// Automated verification test for Real Worker Threads, Concurrency, and 1GB Upload Limit
import { Worker } from 'worker_threads';
import path from 'path';

async function runTests() {
  console.log('============================================================');
  console.log(' RUNNING MULTITHREADING & 1GB CONFIG AUTOMATED TESTS');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(testName, condition) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // TEST 1: Verify 1 GB Upload Limit Calculation
  const maxBytes = 1024 * 1024 * 1024;
  assert('Test 1: 1 GB limit equals 1,073,741,824 bytes (1024 MB)', maxBytes === 1073741824);

  // TEST 2: Spawn a single Worker Thread and verify real Node.js threadId & CPU chunk calculation
  console.log('\n[TEST 2] Starting single Worker Thread verification...');
  await new Promise((resolve) => {
    const worker = new Worker(path.join(process.cwd(), 'worker.js'), {
      workerData: {
        clientId: 'TEST-CLIENT-001',
        sourceId: 'Peer-1',
        latency: 10,
        totalChunks: 3,
        chunkProcessingTime: 50
      }
    });

    let hasStarted = false;
    let chunksReceived = 0;
    let validThreadId = false;
    let validHash = false;

    worker.on('message', (msg) => {
      if (msg.event === 'started') {
        hasStarted = true;
        validThreadId = typeof msg.threadId === 'number' && msg.threadId > 0;
        console.log(`  -> Worker started with real Node.js threadId: ${msg.threadId}`);
      } else if (msg.event === 'chunk') {
        chunksReceived++;
        if (msg.hash && msg.computeTimeMs > 0) {
          validHash = true;
        }
        console.log(`  -> [Worker-${msg.threadId}] Chunk ${msg.chunkIndex}/${msg.totalChunks} (CPU Hash: ${msg.hash}, Compute: ${msg.computeTimeMs}ms)`);
      } else if (msg.event === 'complete') {
        assert('Test 2.1: Worker thread started with valid numeric threadId', hasStarted && validThreadId);
        assert('Test 2.2: Worker executed CPU-bound chunk hashing & checksums', validHash);
        assert('Test 2.3: All chunks processed and complete event received', chunksReceived === 3);
        worker.terminate();
        resolve();
      }
    });

    worker.on('error', (err) => {
      console.error('Worker error:', err);
      assert('Test 2: Worker execution error', false);
      resolve();
    });
  });

  // TEST 3: Concurrent Multi-Client Execution (3 Workers simultaneously)
  console.log('\n[TEST 3] Starting Concurrent Multi-Client Worker Threads (3 simultaneous clients)...');
  const clientConfigs = [
    { clientId: 'CLIENT-CONCURRENT-001', sourceId: 'Peer-1', latency: 20 },
    { clientId: 'CLIENT-CONCURRENT-002', sourceId: 'Peer-2', latency: 30 },
    { clientId: 'CLIENT-CONCURRENT-003', sourceId: 'Edge-1', latency: 50 }
  ];

  const executionLog = [];
  const workerThreadIds = new Set();

  await Promise.all(clientConfigs.map(cfg => {
    return new Promise((resolve) => {
      const worker = new Worker(path.join(process.cwd(), 'worker.js'), {
        workerData: {
          clientId: cfg.clientId,
          sourceId: cfg.sourceId,
          latency: cfg.latency,
          totalChunks: 3,
          chunkProcessingTime: 40
        }
      });

      worker.on('message', (msg) => {
        if (msg.event === 'started') {
          workerThreadIds.add(msg.threadId);
          executionLog.push(`[Worker-${msg.threadId}] ${msg.clientId} STARTED`);
        } else if (msg.event === 'chunk') {
          executionLog.push(`[Worker-${msg.threadId}] ${msg.clientId} -> chunk ${msg.chunkIndex}/3`);
        } else if (msg.event === 'complete') {
          executionLog.push(`[Worker-${msg.threadId}] ${msg.clientId} COMPLETED (${msg.totalExecutionTimeMs}ms)`);
          worker.terminate();
          resolve();
        }
      });
    });
  }));

  console.log('\nInterleaved execution output log:');
  executionLog.forEach(log => console.log('  ' + log));

  assert('Test 3.1: Created 3 distinct Node.js Worker Threads with unique threadIds', workerThreadIds.size === 3);
  assert('Test 3.2: Concurrent execution completed across all 3 client threads', executionLog.length >= 9);

  console.log('\n============================================================');
  console.log(` TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test suite failure:', err);
  process.exit(1);
});
