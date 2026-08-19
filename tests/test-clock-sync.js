import { ClockManager } from '../experiments/clock/clockManager.js';
import assert from 'assert';

console.log('====================================================');
console.log('RUNNING AUTOMATED CLOCK SYNCHRONIZATION TEST SUITE');
console.log('====================================================\n');

// Mock socket.io and logger
const mockEvents = [];
const mockIo = {
  emit: (event, payload) => mockEvents.push({ event, payload }),
  to: () => ({ emit: (event, payload) => mockEvents.push({ event, payload }) })
};
const mockLogger = (msg) => console.log(`[TEST-LOG] ${msg}`);

const cm = new ClockManager(mockIo, mockLogger);

// Test 1: Initial Skews & Physical Clocks
console.log('--- TEST 1: Initial Clock State & Skews ---');
const initialNodes = cm.getNodes();
assert.strictEqual(initialNodes.length, 5, 'Should have 5 distributed nodes');
const vts = cm.getNode('VTS');
const peer1 = cm.getNode('Peer-1');
const peer2 = cm.getNode('Peer-2');
const edge1 = cm.getNode('Edge-1');
const cdn1 = cm.getNode('CDN-1');

assert.strictEqual(vts.offsetMs, 0, 'VTS offset should be 0ms (Time Server)');
assert.strictEqual(peer1.offsetMs, 5000, 'Peer-1 initial skew should be +5000ms');
assert.strictEqual(peer2.offsetMs, -2000, 'Peer-2 initial skew should be -2000ms');
assert.strictEqual(edge1.offsetMs, 3000, 'Edge-1 initial skew should be +3000ms');
assert.strictEqual(cdn1.offsetMs, 7000, 'CDN-1 initial skew should be +7000ms');
console.log('✓ Initial clock skews verified.');

// Test 2: Cristian's Algorithm
console.log('\n--- TEST 2: Cristian\'s Algorithm on Peer-1 ---');
const cristianRes = cm.runCristian('Peer-1', false);
assert(cristianRes.rtt >= 0, 'RTT must be non-negative');
assert.strictEqual(cristianRes.estimatedOneWayDelay, Math.round(cristianRes.rtt / 2), 'Estimated delay must be RTT / 2');
assert.strictEqual(cristianRes.timeServer, 'VTS', 'Server must be VTS');

const peer1AfterCristian = cm.getNode('Peer-1');
assert.strictEqual(peer1AfterCristian.status, 'SYNCHRONIZED', 'Peer-1 should be SYNCHRONIZED');
assert(Math.abs(peer1AfterCristian.offsetMs) <= 25, `Peer-1 offset after Cristian should be near 0ms, got ${peer1AfterCristian.offsetMs}ms`);
console.log(`✓ Cristian's algorithm adjusted Peer-1 from +5000ms to ${peer1AfterCristian.offsetMs}ms (RTT: ${cristianRes.rtt}ms, Delay: ${cristianRes.estimatedOneWayDelay}ms).`);

// Test 3: Berkeley Algorithm
console.log('\n--- TEST 3: Berkeley Algorithm Across All Nodes ---');
cm.resetAll(); // Reset skews back to deterministic values
const berkeleyRes = cm.runBerkeley();

assert.strictEqual(berkeleyRes.coordinator, 'VTS', 'Coordinator must be VTS');
assert.strictEqual(Object.keys(berkeleyRes.polledClocks).length, 5, 'Polled clocks must include 5 nodes');
assert.strictEqual(Object.keys(berkeleyRes.adjustments).length, 5, 'Adjustments must be calculated for 5 nodes');

const postNodes = cm.getNodes();
const postOffsets = postNodes.map(n => n.offsetMs);
const maxDiff = Math.max(...postOffsets) - Math.min(...postOffsets);

console.log(`Berkeley Post-Sync offsets: [${postOffsets.join(', ')}] ms. Max discrepancy across all 5 nodes: ${maxDiff}ms`);
assert(maxDiff <= 5, `All nodes should be within 5ms consensus after Berkeley, got max diff ${maxDiff}ms`);
postNodes.forEach(n => {
  assert.strictEqual(n.status, 'SYNCHRONIZED', `${n.id} status should be synchronized`);
});
console.log('✓ Berkeley algorithm achieved consensus average synchronization across all 5 nodes.');

// Test 4: Lamport Logical Clocks
console.log('\n--- TEST 4: Lamport Logical Clocks (Causality & Rule Checks) ---');
cm.resetAll();

// Rule 1: Local events
const ev1 = cm.recordLamportLocalEvent('Peer-1', 'BUFFER_VIDEO_CHUNK');
assert.strictEqual(ev1.lamportTime, 1, 'First event on Peer-1 should have L=1');
const ev2 = cm.recordLamportLocalEvent('Peer-1', 'DECODE_FRAME');
assert.strictEqual(ev2.lamportTime, 2, 'Second event on Peer-1 should have L=2');

// Rule 2 & 3: Message Passing
const msgSend = cm.recordLamportMessage('Peer-1', 'VTS', 'STREAM_TELEMETRY', { test: true });
assert.strictEqual(msgSend.sendEvent.lamportTime, 3, 'Peer-1 send event should increment to L=3');
assert.strictEqual(msgSend.receiveEvent.lamportTime, 4, 'VTS receive event should be max(0, 3) + 1 = 4');

// Advance Edge-1 to L=10
for (let i = 0; i < 10; i++) {
  cm.recordLamportLocalEvent('Edge-1', 'LOCAL_COMPUTE');
}
assert.strictEqual(cm.getLamportClocks()['Edge-1'], 10, 'Edge-1 should be at L=10');

// Edge-1 sends message to Peer-2 (whose L=0)
const msgSend2 = cm.recordLamportMessage('Edge-1', 'Peer-2', 'RELAY_CHUNK', {});
assert.strictEqual(msgSend2.sendEvent.lamportTime, 11, 'Edge-1 send should be L=11');
assert.strictEqual(msgSend2.receiveEvent.lamportTime, 12, 'Peer-2 receive should jump from L=0 to max(0, 11) + 1 = 12');

// Invariant: Physical clock must NOT be altered by Lamport
const peer1PhysicalAfterLamport = cm.getNode('Peer-1');
assert.strictEqual(peer1PhysicalAfterLamport.offsetMs, 5000, 'Lamport MUST NOT alter physical clock skew!');
console.log('✓ Lamport logical clock rules verified (L=L+1 and L_recv = max(L_recv, L_msg)+1). Physical clocks preserved.');

// Test 5: Step-by-Step State Machine
console.log('\n--- TEST 5: Step-by-Step Controller ---');
cm.resetAll();
let step1 = cm.stepNext('cristian');
assert.strictEqual(step1.currentStep, 1, 'Should advance to step 1');
let step2 = cm.stepNext('cristian');
assert.strictEqual(step2.currentStep, 2, 'Should advance to step 2');
let step3 = cm.stepNext('cristian');
let step4 = cm.stepNext('cristian');
let step5 = cm.stepNext('cristian');
assert.strictEqual(step5.currentStep, 5, 'Should reach final step 5');
assert.strictEqual(step5.completed, true, 'Cristian step execution should be marked completed');
console.log('✓ Step-by-step state machine operates smoothly.');

console.log('\n====================================================');
console.log('ALL CLOCK SYNCHRONIZATION TESTS PASSED SUCCESSFULLY!');
console.log('====================================================\n');
