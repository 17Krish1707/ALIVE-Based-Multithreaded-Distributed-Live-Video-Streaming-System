// Test script to verify Virtual Tracker Server allocation logic

// Simulated source nodes matching the backend logic
const sources = [
  { id: 'Peer-1', name: 'Peer-1', type: 'P2P Peer', latency: 20, capacity: 1, connected: 0, online: true },
  { id: 'Peer-2', name: 'Peer-2', type: 'P2P Peer', latency: 30, capacity: 1, connected: 0, online: true },
  { id: 'Edge-1', name: 'Edge-1', type: 'Edge Server', latency: 50, capacity: 2, connected: 0, online: true },
  { id: 'CDN-1', name: 'CDN-1', type: 'CDN', latency: 100, capacity: 3, connected: 0, online: true }
];

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

function runTests() {
  console.log('============================================================');
  console.log(' RUNNING VTS SOURCE SELECTION AUTOMATED TESTS');
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

  // Reset node loads
  const resetSources = () => sources.forEach(s => { s.connected = 0; s.online = true; });

  // TEST 1: Initial state, Peer-1 should be chosen (lowest latency = 20ms)
  resetSources();
  let first = selectBestSource();
  assert('Test 1: Lowest latency source (Peer-1) chosen first', first && first.id === 'Peer-1');

  // TEST 2: Peer-1 is full, Peer-2 (30ms) should be chosen next
  resetSources();
  const peer1 = sources.find(s => s.id === 'Peer-1');
  peer1.connected = 1; // Mark Peer-1 busy
  let second = selectBestSource();
  assert('Test 2: Peer-1 busy, Peer-2 chosen', second && second.id === 'Peer-2');

  // TEST 3: Peers are full, Edge-1 (50ms) should be chosen next
  resetSources();
  sources.find(s => s.id === 'Peer-1').connected = 1;
  sources.find(s => s.id === 'Peer-2').connected = 1;
  let third = selectBestSource();
  assert('Test 3: P2P nodes busy, Edge-1 chosen', third && third.id === 'Edge-1');

  // TEST 4: Peer-1 is free but OFFLINE. Peer-2 should be chosen.
  resetSources();
  sources.find(s => s.id === 'Peer-1').online = false; // Peer-1 offline
  let fourth = selectBestSource();
  assert('Test 4: Peer-1 offline (even though free), Peer-2 chosen', fourth && fourth.id === 'Peer-2');

  // TEST 5: All nodes full. VTS should return null.
  resetSources();
  sources.forEach(s => s.connected = s.capacity);
  let fifth = selectBestSource();
  assert('Test 5: VTS capacity exhausted, return null (reject client)', fifth === null);

  console.log('\n============================================================');
  console.log(` TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
