import assert from 'assert';
import { ElectionManager } from '../experiments/election/electionManager.js';
import { initDB, getElectionHistory, getElectionMessages } from '../db.js';

console.log('====================================================');
console.log('RUNNING AUTOMATED DISTRIBUTED ELECTION TEST SUITE');
console.log('====================================================\n');

async function runTests() {
  await initDB();

  const mockEvents = [];
  const mockIo = {
    emit: (event, payload) => mockEvents.push({ event, payload }),
    to: () => ({ emit: (event, payload) => mockEvents.push({ event, payload }) })
  };
  const mockLogger = (msg) => {}; // silence extra output for clean test report

  const testSources = [
    { id: 'Peer-1', name: 'Peer-1', type: 'P2P Peer', latency: 20, capacity: 1, connected: 0, online: true },
    { id: 'Peer-2', name: 'Peer-2', type: 'P2P Peer', latency: 30, capacity: 1, connected: 0, online: true },
    { id: 'Edge-1', name: 'Edge-1', type: 'Edge Server', latency: 50, capacity: 2, connected: 0, online: true },
    { id: 'CDN-1',  name: 'CDN-1',  type: 'CDN',        latency: 100, capacity: 3, connected: 0, online: true }
  ];

  let failoverTriggeredFor = null;
  const mockFailover = async (failedId) => {
    failoverTriggeredFor = failedId;
  };

  const em = new ElectionManager(testSources, mockIo, mockLogger, mockFailover);
  // Set minimal delay for fast test execution
  em.messageDelayMs = 10;

  // TEST 1: Initial Baseline State
  console.log('--- TEST 1: Initial Baseline Topology & Coordinator ---');
  const state1 = em.getState();
  assert.strictEqual(state1.currentCoordinator, 'CDN-1', 'Initial coordinator must be CDN-1');
  assert.strictEqual(state1.coordinatorElectionId, 4, 'Coordinator election ID must be 4');
  assert.strictEqual(state1.nodes.length, 4, 'Must have 4 node agents');
  assert.strictEqual(state1.nodes.every(n => n.online), true, 'All 4 nodes must be ONLINE initially');
  assert.strictEqual(state1.coordinatorFailureDetected, false, 'No coordinator failure detected initially');
  console.log('✓ Initial baseline verified: CDN-1 (ID 4) is coordinator, all 4 nodes online.');

  // TEST 2: Bully Algorithm Execution
  console.log('\n--- TEST 2: Bully Algorithm Execution on Coordinator CDN-1 Failure ---');
  await em.failNode('CDN-1');
  assert.strictEqual(em.coordinatorFailureDetected, true, 'Coordinator failure must be detected when CDN-1 fails');
  assert.strictEqual(testSources.find(s => s.id === 'CDN-1').online, false, 'CDN-1 must be marked offline in shared sources');

  const bullyRes = await em.startElection('BULLY', 'Peer-1');
  assert.strictEqual(bullyRes.algorithm, 'BULLY');
  assert.strictEqual(bullyRes.initiator, 'Peer-1');
  assert.strictEqual(bullyRes.new_coordinator, 'Edge-1', 'Edge-1 (ID 3) must win Bully election since CDN-1 is offline');
  assert.strictEqual(bullyRes.new_coordinator_id, 3);
  assert.strictEqual(em.currentCoordinator, 'Edge-1');
  assert.strictEqual(em.coordinatorFailureDetected, false, 'Coordinator failure flag cleared after election');
  assert(bullyRes.breakdown.election > 0, 'ELECTION messages must be sent');
  assert(bullyRes.breakdown.ok > 0, 'OK messages must be sent');
  assert(bullyRes.breakdown.coordinator > 0, 'COORDINATOR announcement messages must be sent');
  console.log(`✓ Bully algorithm executed: Edge-1 elected coordinator (${bullyRes.message_count} messages, ${bullyRes.duration_ms}ms).`);

  // TEST 3: Ring Algorithm Execution
  console.log('\n--- TEST 3: Ring Algorithm Execution on Coordinator Failure ---');
  em.resetAll();
  assert.strictEqual(em.currentCoordinator, 'CDN-1');

  await em.failNode('CDN-1');
  const ringRes = await em.startElection('RING', 'Peer-1');
  assert.strictEqual(ringRes.algorithm, 'RING');
  assert.strictEqual(ringRes.initiator, 'Peer-1');
  assert.strictEqual(ringRes.new_coordinator, 'Edge-1', 'Edge-1 (max ID 3) must win Ring election');
  assert.deepStrictEqual(ringRes.token_route, ['Peer-1', 'Peer-2', 'Edge-1', 'Peer-1'], 'Token must route Peer-1 -> Peer-2 -> Edge-1 -> Peer-1 skipping offline CDN-1');
  assert.strictEqual(em.currentCoordinator, 'Edge-1');
  console.log(`✓ Ring algorithm executed: Token route [${ringRes.token_route.join(' -> ')}], Winner: Edge-1.`);

  // TEST 4: Ring Skipping Multiple Offline Nodes
  console.log('\n--- TEST 4: Ring Dynamic Routing Skipping Multiple Offline Nodes ---');
  em.resetAll();
  await em.failNode('CDN-1');
  await em.failNode('Peer-2'); // Both CDN-1 and Peer-2 are offline

  const ringRes2 = await em.startElection('RING', 'Peer-1');
  assert.strictEqual(ringRes2.new_coordinator, 'Edge-1');
  assert.deepStrictEqual(ringRes2.token_route, ['Peer-1', 'Edge-1', 'Peer-1'], 'Token must dynamically skip Peer-2 and CDN-1');
  console.log(`✓ Dynamic Ring verified with Peer-2 & CDN-1 offline: Route [${ringRes2.token_route.join(' -> ')}].`);

  // TEST 5: Non-Coordinator Failure Does NOT Trigger Election
  console.log('\n--- TEST 5: Failing Non-Coordinator Node ---');
  em.resetAll();
  assert.strictEqual(em.currentCoordinator, 'CDN-1');

  // Simulate Peer-1 streaming load
  testSources.find(s => s.id === 'Peer-1').connected = 1;
  await em.failNode('Peer-1');

  assert.strictEqual(em.coordinatorFailureDetected, false, 'Failing Peer-1 MUST NOT flag coordinator failure');
  assert.strictEqual(em.currentCoordinator, 'CDN-1', 'Coordinator must remain CDN-1');
  assert.strictEqual(failoverTriggeredFor, 'Peer-1', 'VTS failover reallocation must be invoked for streaming node');
  console.log('✓ Non-coordinator failure handled: VTS failover triggered, NO coordinator election flagged.');

  // TEST 6: Node Recovery
  console.log('\n--- TEST 6: Node Recovery & Heartbeat Resumption ---');
  await em.recoverNode('Peer-1');
  const peer1Agent = em.nodeAgents.get('Peer-1');
  assert.strictEqual(peer1Agent.online, true, 'Peer-1 must be online after recovery');
  assert.strictEqual(peer1Agent.heartbeatStatus, 'ACTIVE', 'Peer-1 heartbeat status must be ACTIVE');
  assert.strictEqual(testSources.find(s => s.id === 'Peer-1').online, true, 'Shared source must be marked online');
  console.log('✓ Node recovery verified: Peer-1 restored to ONLINE and heartbeat active.');

  // TEST 7: Higher-Priority Recovery Policy
  console.log('\n--- TEST 7: Higher-Priority Node Recovery Policy ---');
  em.resetAll();
  await em.failNode('CDN-1');
  await em.startElection('BULLY', 'Peer-1');
  assert.strictEqual(em.currentCoordinator, 'Edge-1', 'Edge-1 is coordinator (ID 3)');

  // Default policy: KEEP
  em.setConfig({ recoveryPolicy: 'KEEP' });
  const recResKeep = await em.recoverNode('CDN-1'); // ID 4 recovers
  assert.strictEqual(em.currentCoordinator, 'Edge-1', 'Under KEEP policy, coordinator must remain Edge-1');
  assert.strictEqual(recResKeep.electionTriggered, false);
  console.log('✓ Recovery policy KEEP verified: Current coordinator retained despite higher ID node recovering.');

  // TEST 8: Database Persistence
  console.log('\n--- TEST 8: Election History and Messages Persistence ---');
  const history = await getElectionHistory(10);
  assert(history.length >= 3, 'Election history must have records from previous runs');
  const latestRun = history[0];
  assert(latestRun.algorithm === 'BULLY' || latestRun.algorithm === 'RING', 'Algorithm must be recorded');
  assert(latestRun.new_coordinator, 'Winner must be recorded');
  assert(latestRun.duration_ms >= 0, 'Duration must be recorded');

  const messages = await getElectionMessages(null, 20);
  assert(messages.length > 0, 'Election messages must be saved in database');
  console.log(`✓ Database persistence verified: Found ${history.length} election history records and ${messages.length} message logs.`);

  // Cleanup timers
  em.stopHeartbeatMonitor();

  console.log('\n====================================================');
  console.log('ALL DISTRIBUTED ELECTION TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
