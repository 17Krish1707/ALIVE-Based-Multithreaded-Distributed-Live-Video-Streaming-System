import { parentPort, workerData, threadId } from 'worker_threads';
import crypto from 'crypto';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Controlled CPU-bound processing per chunk:
// Generates chunk buffer, computes cryptographic SHA-256 hash and checksum
function processChunkComputation(clientId, chunkIndex) {
  const startCompute = performance.now();
  
  // Create simulated 64KB video chunk payload
  const seed = `${clientId}-chunk-${chunkIndex}-${Date.now()}`;
  const chunkBuffer = Buffer.alloc(64 * 1024);
  
  // Fill buffer with pseudo-data and compute hash
  for (let i = 0; i < chunkBuffer.length; i += 32) {
    const hashPart = crypto.createHash('sha256').update(seed + i).digest();
    hashPart.copy(chunkBuffer, i, 0, Math.min(32, chunkBuffer.length - i));
  }

  // Calculate SHA-256 chunk checksum
  const chunkHash = crypto.createHash('sha256').update(chunkBuffer).digest('hex');
  
  // Calculate Adler-32 / CRC checksum
  let a = 1, b = 0;
  for (let i = 0; i < chunkBuffer.length; i++) {
    a = (a + chunkBuffer[i]) % 65521;
    b = (b + a) % 65521;
  }
  const checksum = (b << 16) | a;

  const computeTimeMs = Math.round((performance.now() - startCompute) * 100) / 100;

  return {
    hash: chunkHash.substring(0, 12),
    checksum: checksum.toString(16),
    computeTimeMs: Math.max(1, computeTimeMs)
  };
}

async function run() {
  const { clientId, sourceId, latency, totalChunks, chunkProcessingTime, continuous } = workerData;
  const startTime = Date.now();

  // Notify parent that worker thread has started execution
  parentPort.postMessage({
    event: 'started',
    threadId,
    clientId,
    sourceId,
    startTime
  });

  const maxChunks = totalChunks || (continuous ? Infinity : 5);
  let chunkIndex = 1;

  // Process video chunks continuously while client is streaming
  while (chunkIndex <= maxChunks) {
    // 1. Perform CPU-bound chunk hashing & checksum verification
    const { hash, checksum, computeTimeMs } = processChunkComputation(clientId, chunkIndex);

    // 2. Simulate source latency + random network jitter (20-60ms)
    const jitter = Math.floor(Math.random() * 40) + 20;
    const baseWait = chunkProcessingTime || 400;
    const waitTime = Math.max(10, (latency + baseWait + jitter) - computeTimeMs);
    
    await sleep(waitTime);

    const chunkDurationMs = Math.round(computeTimeMs + waitTime);

    parentPort.postMessage({
      event: 'chunk',
      threadId,
      clientId,
      sourceId,
      chunkIndex,
      totalChunks: maxChunks === Infinity ? 'LIVE' : maxChunks,
      hash,
      checksum,
      computeTimeMs,
      elapsedTimeMs: chunkDurationMs
    });

    chunkIndex++;
  }

  // Finalize worker task if bounded
  await sleep(50);
  const totalExecutionTimeMs = Date.now() - startTime;

  parentPort.postMessage({
    event: 'complete',
    threadId,
    clientId,
    sourceId,
    totalExecutionTimeMs
  });
}

run().catch((err) => {
  parentPort.postMessage({
    event: 'error',
    threadId,
    clientId: workerData?.clientId,
    sourceId: workerData?.sourceId,
    error: err.message
  });
});
