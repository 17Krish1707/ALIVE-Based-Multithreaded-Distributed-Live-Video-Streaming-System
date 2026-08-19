/**
 * Distributed Clock Synchronization Experiment Engine
 * 
 * Implements:
 * 1. Cristian's Algorithm (Time server + RTT/2 delay estimation + physical clock correction)
 * 2. Berkeley Algorithm (Coordinator polling + average calculation + offset adjustments)
 * 3. Lamport Logical Clocks (Logical counter L, L = max(L_local, L_msg) + 1 for distributed event ordering)
 * 
 * Reuses existing distributed nodes: VTS, Peer-1, Peer-2, Edge-1, CDN-1.
 */

// Initial deterministic clock offsets (in milliseconds)
const INITIAL_OFFSETS = {
  'VTS': 0,
  'Peer-1': 5000,    // Fast (+5s)
  'Peer-2': -2000,   // Slow (-2s)
  'Edge-1': 3000,    // Fast (+3s)
  'CDN-1': 7000      // Fast (+7s)
};

// Node metadata matching existing system topology
const NODE_METADATA = {
  'VTS': { name: 'VTS (Tracker)', type: 'Master Server', baseLatency: 0 },
  'Peer-1': { name: 'Peer-1', type: 'P2P Peer', baseLatency: 20 },
  'Peer-2': { name: 'Peer-2', type: 'P2P Peer', baseLatency: 30 },
  'Edge-1': { name: 'Edge-1', type: 'Edge Server', baseLatency: 50 },
  'CDN-1': { name: 'CDN-1', type: 'CDN Node', baseLatency: 100 }
};

class ClockManager {
  constructor(io, logEventFn) {
    this.io = io;
    this.logEvent = logEventFn || console.log;

    // Node clock state
    this.nodes = {};
    
    // Lamport state
    this.lamportClocks = {};
    this.lamportEvents = [];
    this.maxEvents = 100;

    // Active algorithm & step state
    this.activeAlgorithm = 'cristian'; // 'cristian' | 'berkeley' | 'lamport'
    this.stepState = {
      algorithm: null,
      currentStep: 0,
      totalSteps: 5,
      data: null,
      completed: false
    };

    // Experiment results cache
    this.lastCristianResult = null;
    this.lastBerkeleyResult = null;
    this.lastLamportResult = null;

    // Experiment logs
    this.clockLogs = [];

    // Initialize nodes
    this.resetAll();
  }

  // Set or update the Socket.IO instance if loaded later
  setIO(io) {
    this.io = io;
  }

  setLogFn(fn) {
    this.logEvent = fn;
  }

  logClockEvent(msg) {
    const timestamp = new Date().toISOString();
    const logStr = `[${timestamp}] ${msg}`;
    this.clockLogs.push(logStr);
    if (this.clockLogs.length > 200) this.clockLogs.shift();

    if (this.logEvent) {
      this.logEvent(msg, true);
    }
    if (this.io) {
      this.io.emit('clock_log', logStr);
    }
  }

  // Reset clock offsets and Lamport state to initial defaults
  resetAll() {
    this.nodes = {
      'VTS': {
        id: 'VTS',
        name: NODE_METADATA['VTS'].name,
        type: NODE_METADATA['VTS'].type,
        offsetMs: INITIAL_OFFSETS['VTS'],
        initialOffsetMs: INITIAL_OFFSETS['VTS'],
        status: 'MASTER',
        role: 'TIME_SERVER / COORDINATOR',
        lastCorrectionMs: 0,
        syncCount: 0
      },
      'Peer-1': {
        id: 'Peer-1',
        name: NODE_METADATA['Peer-1'].name,
        type: NODE_METADATA['Peer-1'].type,
        offsetMs: INITIAL_OFFSETS['Peer-1'],
        initialOffsetMs: INITIAL_OFFSETS['Peer-1'],
        status: 'UNSYNCED',
        role: 'CLIENT_NODE',
        lastCorrectionMs: 0,
        syncCount: 0
      },
      'Peer-2': {
        id: 'Peer-2',
        name: NODE_METADATA['Peer-2'].name,
        type: NODE_METADATA['Peer-2'].type,
        offsetMs: INITIAL_OFFSETS['Peer-2'],
        initialOffsetMs: INITIAL_OFFSETS['Peer-2'],
        status: 'UNSYNCED',
        role: 'CLIENT_NODE',
        lastCorrectionMs: 0,
        syncCount: 0
      },
      'Edge-1': {
        id: 'Edge-1',
        name: NODE_METADATA['Edge-1'].name,
        type: NODE_METADATA['Edge-1'].type,
        offsetMs: INITIAL_OFFSETS['Edge-1'],
        initialOffsetMs: INITIAL_OFFSETS['Edge-1'],
        status: 'UNSYNCED',
        role: 'CLIENT_NODE',
        lastCorrectionMs: 0,
        syncCount: 0
      },
      'CDN-1': {
        id: 'CDN-1',
        name: NODE_METADATA['CDN-1'].name,
        type: NODE_METADATA['CDN-1'].type,
        offsetMs: INITIAL_OFFSETS['CDN-1'],
        initialOffsetMs: INITIAL_OFFSETS['CDN-1'],
        status: 'UNSYNCED',
        role: 'CLIENT_NODE',
        lastCorrectionMs: 0,
        syncCount: 0
      }
    };

    this.lamportClocks = {
      'VTS': 0,
      'Peer-1': 0,
      'Peer-2': 0,
      'Edge-1': 0,
      'CDN-1': 0
    };

    this.lamportEvents = [];
    this.lastCristianResult = null;
    this.lastBerkeleyResult = null;
    this.lastLamportResult = null;
    this.stepState = {
      algorithm: null,
      currentStep: 0,
      totalSteps: 5,
      data: null,
      completed: false
    };

    this.logClockEvent('[CLOCK] Experiment state reset. Default offsets and Lamport counters restored.');
    this.broadcastState();
  }

  // Get current simulated time for a node
  getNodeTime(nodeId) {
    const node = this.nodes[nodeId];
    const offset = node ? node.offsetMs : 0;
    return Date.now() + offset;
  }

  // Get formatted state of all node clocks
  getState() {
    const now = Date.now();
    const nodeStates = Object.values(this.nodes).map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
      offsetMs: n.offsetMs,
      initialOffsetMs: n.initialOffsetMs,
      simulatedTime: now + n.offsetMs,
      status: n.status,
      role: n.role,
      lastCorrectionMs: n.lastCorrectionMs,
      syncCount: n.syncCount,
      lamportClock: this.lamportClocks[n.id] || 0
    }));

    return {
      nodes: nodeStates,
      lamportClocks: { ...this.lamportClocks },
      lamportEvents: this.lamportEvents.slice(0, 30),
      activeAlgorithm: this.activeAlgorithm,
      stepState: this.stepState,
      lastCristianResult: this.lastCristianResult,
      lastBerkeleyResult: this.lastBerkeleyResult,
      lastLamportResult: this.lastLamportResult,
      logs: this.clockLogs.slice(-50)
    };
  }

  getNodes() {
    return Object.values(this.nodes);
  }

  getNode(nodeId) {
    return this.nodes[nodeId] || null;
  }

  getLamportClocks() {
    return { ...this.lamportClocks };
  }

  broadcastState() {
    if (this.io) {
      this.io.emit('clock_state', this.getState());
    }
  }

  // =========================================================================
  // 1. CRISTIAN'S ALGORITHM
  // =========================================================================
  /**
   * Runs Cristian's algorithm for a target node (or all un-synced nodes sequentially).
   * 
   * Steps:
   * 1. T0 = Node requests time from VTS (recorded in Node's local clock)
   * 2. Tserver = VTS reads its own simulated clock
   * 3. T1 = Node receives response (recorded in Node's local clock)
   * 4. RTT = T1 - T0
   * 5. Estimated one-way network delay = RTT / 2
   * 6. Corrected server time = Tserver + (RTT / 2)
   * 7. Required correction = Corrected server time - T1
   * 8. Apply correction to Node's offset.
   */
  runCristian(targetNodeId = 'Peer-1', simulatedNetworkJitter = true) {
    this.activeAlgorithm = 'cristian';
    const node = this.nodes[targetNodeId];
    if (!node || targetNodeId === 'VTS') {
      return { error: 'Invalid target node for Cristian synchronization' };
    }

    const baseLat = NODE_METADATA[targetNodeId]?.baseLatency || 30;
    // Simulate real one-way network propagation delay with slight asymmetry jitter
    const jitter = simulatedNetworkJitter ? Math.floor(Math.random() * 8) - 4 : 0;
    const reqDelay = Math.max(5, baseLat + jitter);
    const respDelay = Math.max(5, baseLat - jitter);
    const actualRtt = reqDelay + respDelay;

    // 1. T0: Request sent from Node (Node's local simulated time)
    const t0 = Date.now() + node.offsetMs;

    // 2. Tserver: VTS processes request at arrival time (VTS simulated time)
    const vtsArrivalTime = Date.now() + reqDelay;
    const tServer = vtsArrivalTime + this.nodes['VTS'].offsetMs;

    // 3. T1: Response received back at Node (Node's local simulated time)
    const t1 = t0 + actualRtt;

    // 4. Calculations
    const rtt = t1 - t0;
    const estimatedOneWayDelay = Math.round(rtt / 2);
    const estimatedCorrectTime = tServer + estimatedOneWayDelay;
    
    // Correction needed relative to node's clock at reception (T1)
    const correctionMs = estimatedCorrectTime - t1;

    // Apply correction to simulated physical clock offset
    const oldOffset = node.offsetMs;
    node.offsetMs += correctionMs;
    node.status = 'SYNCHRONIZED';
    node.lastCorrectionMs = correctionMs;
    node.syncCount++;

    const result = {
      targetNodeId,
      timeServer: 'VTS',
      t0,
      tServer,
      t1,
      rtt,
      estimatedOneWayDelay,
      estimatedCorrectTime,
      nodeTimeAtT1: t1,
      oldOffsetMs: oldOffset,
      newOffsetMs: node.offsetMs,
      correctionMs,
      correctionSec: (correctionMs / 1000).toFixed(3),
      timestamp: new Date().toISOString()
    };

    this.lastCristianResult = result;

    this.logClockEvent(`[CRISTIAN] Experiment started for ${targetNodeId}`);
    this.logClockEvent(`[CRISTIAN] ${targetNodeId} -> VTS TIME_REQUEST (T0=${new Date(t0).toISOString().split('T')[1]})`);
    this.logClockEvent(`[CRISTIAN] VTS received TIME_REQUEST (Tserver=${new Date(tServer).toISOString().split('T')[1]})`);
    this.logClockEvent(`[CRISTIAN] VTS -> ${targetNodeId} TIME_RESPONSE (T1=${new Date(t1).toISOString().split('T')[1]})`);
    this.logClockEvent(`[CRISTIAN] RTT = ${rtt}ms, Estimated delay = ${estimatedOneWayDelay}ms`);
    this.logClockEvent(`[CRISTIAN] ${targetNodeId} Clock Correction = ${result.correctionSec}s`);
    this.logClockEvent(`[CRISTIAN] ${targetNodeId} successfully SYNCHRONIZED with VTS`);

    // Record Lamport event for the clock synchronization exchange
    this.recordLamportMessage(targetNodeId, 'VTS', 'TIME_REQUEST', { rtt });
    this.recordLamportMessage('VTS', targetNodeId, 'TIME_RESPONSE', { tServer });

    this.broadcastState();
    return result;
  }

  // Synchronize all nodes using Cristian's algorithm
  runCristianAll() {
    const results = [];
    const clientNodes = ['Peer-1', 'Peer-2', 'Edge-1', 'CDN-1'];
    clientNodes.forEach(id => {
      results.push(this.runCristian(id));
    });
    return results;
  }

  // =========================================================================
  // 2. BERKELEY ALGORITHM
  // =========================================================================
  /**
   * Runs Berkeley algorithm.
   * 
   * IMPORTANT: Does not use an external authoritative time server.
   * VTS acts as the COORDINATOR:
   * 1. Coordinator polls every node (including itself) for their current clock values.
   * 2. Coordinator collects clock readings: { VTS: T_vts, Peer-1: T_peer1, ... }.
   * 3. Coordinator calculates the average time T_avg = sum(T_i) / N.
   * 4. Coordinator calculates per-node adjustments: Adjustment_i = T_avg - T_i.
   * 5. Coordinator sends adjustments to all nodes.
   * 6. All nodes (including VTS) apply their adjustments.
   * 7. All clocks converge to the exact same average time.
   */
  runBerkeley() {
    this.activeAlgorithm = 'berkeley';
    const now = Date.now();
    const allNodeIds = ['VTS', 'Peer-1', 'Peer-2', 'Edge-1', 'CDN-1'];

    this.logClockEvent('[BERKELEY] Experiment started. VTS acting as Berkeley Coordinator.');
    this.logClockEvent('[BERKELEY] VTS polling all distributed nodes for local clock readings...');

    // 1. Collect current clock readings from all nodes
    const nodeReadings = {};
    let sumTimes = 0;

    allNodeIds.forEach(id => {
      const node = this.nodes[id];
      const localTime = now + node.offsetMs;
      nodeReadings[id] = {
        nodeId: id,
        name: node.name,
        type: node.type,
        time: localTime,
        offsetMs: node.offsetMs,
        timeFormatted: new Date(localTime).toISOString().split('T')[1]
      };
      sumTimes += localTime;
      this.logClockEvent(`[BERKELEY] Node ${id} reported local clock: ${nodeReadings[id].timeFormatted} (Offset: ${node.offsetMs >= 0 ? '+' : ''}${node.offsetMs}ms)`);
      
      if (id !== 'VTS') {
        this.recordLamportMessage('VTS', id, 'CLOCK_POLL_REQUEST');
        this.recordLamportMessage(id, 'VTS', 'CLOCK_POLL_RESPONSE', { reportedOffset: node.offsetMs });
      }
    });

    // 2. Compute the exact average clock time across all nodes
    const averageTime = Math.round(sumTimes / allNodeIds.length);
    const averageFormatted = new Date(averageTime).toISOString().split('T')[1];

    this.logClockEvent(`[BERKELEY] Average calculated across all 5 nodes = ${averageFormatted}`);

    // 3. Compute per-node adjustments and apply them
    const adjustments = {};
    const postSyncClocks = {};

    allNodeIds.forEach(id => {
      const node = this.nodes[id];
      const initialNodeTime = nodeReadings[id].time;
      const adjustmentMs = averageTime - initialNodeTime;
      const adjustmentSec = (adjustmentMs / 1000).toFixed(3);

      adjustments[id] = {
        nodeId: id,
        initialTime: initialNodeTime,
        adjustmentMs,
        adjustmentSec,
        sign: adjustmentMs >= 0 ? '+' : ''
      };

      // Apply adjustment to the node's offset
      node.offsetMs += adjustmentMs;
      node.status = 'SYNCHRONIZED';
      node.lastCorrectionMs = adjustmentMs;
      node.syncCount++;

      const finalTime = now + node.offsetMs;
      postSyncClocks[id] = {
        nodeId: id,
        finalTime,
        finalOffsetMs: node.offsetMs,
        finalTimeFormatted: new Date(finalTime).toISOString().split('T')[1]
      };

      this.logClockEvent(`[BERKELEY] Adjustment for ${id}: ${adjustments[id].sign}${adjustmentSec}s -> Synchronized to ${postSyncClocks[id].finalTimeFormatted}`);
      
      if (id !== 'VTS') {
        this.recordLamportMessage('VTS', id, 'CLOCK_ADJUSTMENT_DISPATCH', { adjustmentMs });
      }
    });

    const result = {
      coordinator: 'VTS',
      polledClocks: nodeReadings,
      averageTime,
      averageFormatted,
      adjustments,
      postSyncClocks,
      timestamp: new Date().toISOString()
    };

    this.lastBerkeleyResult = result;
    this.logClockEvent('[BERKELEY] Synchronization completed successfully. All nodes now in agreement.');

    this.broadcastState();
    return result;
  }

  // =========================================================================
  // 3. LAMPORT LOGICAL CLOCKS
  // =========================================================================
  /**
   * Implements Lamport Logical Clock algorithm:
   * Rule 1 (Local event): L_i = L_i + 1
   * Rule 2 (Message send): Message carries timestamp T_msg = L_i
   * Rule 3 (Message receive): L_receiver = max(L_receiver, T_msg) + 1
   * 
   * Physical clocks are NOT modified.
   */
  recordLamportLocalEvent(nodeId, eventType, details = {}) {
    if (!this.lamportClocks[nodeId] && this.lamportClocks[nodeId] !== 0) {
      this.lamportClocks[nodeId] = 0;
    }

    // Rule 1: Increment local clock
    this.lamportClocks[nodeId] += 1;
    const lValue = this.lamportClocks[nodeId];

    const eventRecord = {
      id: this.lamportEvents.length + 1,
      nodeId,
      eventType,
      category: 'LOCAL_EVENT',
      lamportTime: lValue,
      details,
      timestamp: new Date().toISOString()
    };

    this.lamportEvents.unshift(eventRecord);
    if (this.lamportEvents.length > this.maxEvents) this.lamportEvents.pop();

    this.logClockEvent(`[LAMPORT] ${nodeId} | Local Event: ${eventType} -> Logical Clock L=${lValue}`);
    this.broadcastState();
    return eventRecord;
  }

  recordLamportMessage(senderNodeId, receiverNodeId, messageType, payload = {}) {
    if (!this.lamportClocks[senderNodeId] && this.lamportClocks[senderNodeId] !== 0) {
      this.lamportClocks[senderNodeId] = 0;
    }
    if (!this.lamportClocks[receiverNodeId] && this.lamportClocks[receiverNodeId] !== 0) {
      this.lamportClocks[receiverNodeId] = 0;
    }

    // Step 1: Sender advances local clock before sending (Rule 1 & 2)
    this.lamportClocks[senderNodeId] += 1;
    const lSend = this.lamportClocks[senderNodeId];

    const sendRecord = {
      id: this.lamportEvents.length + 1,
      nodeId: senderNodeId,
      targetNodeId: receiverNodeId,
      eventType: `SEND_${messageType}`,
      category: 'MESSAGE_SEND',
      lamportTime: lSend,
      details: { ...payload, sentWithL: lSend },
      timestamp: new Date().toISOString()
    };
    this.lamportEvents.unshift(sendRecord);

    // Step 2: Receiver advances clock based on Rule 3: L_recv = max(L_recv, L_msg) + 1
    const prevReceiverL = this.lamportClocks[receiverNodeId];
    this.lamportClocks[receiverNodeId] = Math.max(prevReceiverL, lSend) + 1;
    const lRecv = this.lamportClocks[receiverNodeId];

    const recvRecord = {
      id: this.lamportEvents.length + 1,
      nodeId: receiverNodeId,
      senderNodeId,
      eventType: `RECEIVE_${messageType}`,
      category: 'MESSAGE_RECEIVE',
      lamportTime: lRecv,
      details: { ...payload, receivedMsgL: lSend, prevLocalL: prevReceiverL },
      timestamp: new Date().toISOString()
    };
    this.lamportEvents.unshift(recvRecord);

    if (this.lamportEvents.length > this.maxEvents) {
      this.lamportEvents = this.lamportEvents.slice(0, this.maxEvents);
    }

    this.logClockEvent(`[LAMPORT] ${senderNodeId} sent ${messageType} [L=${lSend}] -> ${receiverNodeId} received [L=max(${prevReceiverL},${lSend})+1 = ${lRecv}]`);

    this.lastLamportResult = {
      sender: senderNodeId,
      receiver: receiverNodeId,
      messageType,
      lSend,
      prevReceiverL,
      lRecv,
      timestamp: new Date().toISOString()
    };

    this.broadcastState();
    return { sendRecord, recvRecord, sendEvent: sendRecord, receiveEvent: recvRecord };
  }

  // Hook for real distributed streaming events
  handleStreamingEvent(eventType, metadata = {}) {
    const cid = metadata.clientId || 'Client-001';
    const srcId = metadata.sourceId || 'Peer-1';

    switch (eventType) {
      case 'CLIENT_CONNECTED':
        this.recordLamportLocalEvent('VTS', 'CLIENT_CONNECTED', { clientId: cid });
        break;

      case 'WATCH_REQUEST':
        // Client requests stream -> received at Peer/VTS
        this.recordLamportLocalEvent(srcId, 'CLIENT_REQUEST', { clientId: cid });
        this.recordLamportMessage(srcId, 'VTS', 'VTS_ALLOC_REQUEST', { clientId: cid });
        break;

      case 'SOURCE_ALLOCATED':
        this.recordLamportLocalEvent('VTS', 'VTS_ALLOCATION', { clientId: cid, sourceId: srcId });
        this.recordLamportMessage('VTS', srcId, 'ALLOCATION_CONFIRMED', { clientId: cid, sourceId: srcId });
        break;

      case 'WORKER_CREATED':
        this.recordLamportLocalEvent(srcId, 'WORKER_THREAD_SPAWNED', { clientId: cid, threadId: metadata.threadId });
        break;

      case 'CHUNK_SENT':
        if (metadata.chunkIndex % 5 === 0) { // Sample every 5 chunks to avoid flooding
          this.recordLamportLocalEvent(srcId, 'CHUNK_DISPATCHED', { chunkIndex: metadata.chunkIndex, clientId: cid });
        }
        break;

      case 'SOURCE_CHANGED':
        this.recordLamportLocalEvent('VTS', 'FAILOVER_TRIGGERED', { oldSource: metadata.oldSourceId, newSource: metadata.newSourceId });
        this.recordLamportMessage('VTS', metadata.newSourceId, 'REALLOCATION_ASSIGNMENT', { clientId: cid });
        break;

      case 'CLIENT_DISCONNECTED':
        this.recordLamportLocalEvent(srcId, 'CLIENT_SESSION_ENDED', { clientId: cid, reason: metadata.reason || 'USER_DISCONNECT' });
        this.recordLamportMessage(srcId, 'VTS', 'RELEASE_SOURCE_CAPACITY', { sourceId: srcId });
        break;

      case 'ADMIN_DISCONNECT':
        this.recordLamportLocalEvent('VTS', 'ADMIN_DISCONNECT_ISSUED', { clientId: cid });
        this.recordLamportMessage('VTS', srcId, 'TERMINATE_WORKER_THREAD', { clientId: cid });
        break;

      case 'START_LIVE':
        this.recordLamportLocalEvent('VTS', 'LIVE_BROADCAST_STARTED', { videoName: metadata.videoName });
        break;

      case 'STOP_LIVE':
        this.recordLamportLocalEvent('VTS', 'LIVE_BROADCAST_STOPPED', {});
        break;

      default:
        this.recordLamportLocalEvent('VTS', eventType, metadata);
    }
  }

  // =========================================================================
  // 4. STEP-BY-STEP CONTROLLER
  // =========================================================================
  stepNext(algorithm) {
    if (algorithm) {
      this.activeAlgorithm = algorithm;
    }

    if (this.stepState.algorithm !== this.activeAlgorithm || this.stepState.completed) {
      this.stepState = {
        algorithm: this.activeAlgorithm,
        currentStep: 0,
        totalSteps: 5,
        data: null,
        completed: false
      };
    }

    this.stepState.currentStep++;

    if (this.activeAlgorithm === 'cristian') {
      return this.stepCristian();
    } else if (this.activeAlgorithm === 'berkeley') {
      return this.stepBerkeley();
    } else {
      return this.stepLamport();
    }
  }

  stepCristian(targetNodeId = 'Peer-1') {
    const node = this.nodes[targetNodeId];
    const baseLat = NODE_METADATA[targetNodeId]?.baseLatency || 30;
    const actualRtt = baseLat * 2;

    switch (this.stepState.currentStep) {
      case 1:
        // Step 1: TIME_REQUEST sent by Peer-1
        const t0 = Date.now() + node.offsetMs;
        this.stepState.data = { targetNodeId, t0, actualRtt };
        this.logClockEvent(`[CRISTIAN STEP 1/5] ${targetNodeId} generated TIME_REQUEST (T0 = ${new Date(t0).toISOString().split('T')[1]})`);
        break;

      case 2:
        // Step 2: VTS receives and reads server time
        const tServer = Date.now() + this.nodes['VTS'].offsetMs;
        this.stepState.data.tServer = tServer;
        this.logClockEvent(`[CRISTIAN STEP 2/5] VTS received TIME_REQUEST. Server Time Tserver = ${new Date(tServer).toISOString().split('T')[1]}`);
        break;

      case 3:
        // Step 3: Response received at Peer-1, RTT calculated
        const t1 = this.stepState.data.t0 + this.stepState.data.actualRtt;
        const rtt = t1 - this.stepState.data.t0;
        this.stepState.data.t1 = t1;
        this.stepState.data.rtt = rtt;
        this.stepState.data.estimatedDelay = Math.round(rtt / 2);
        this.logClockEvent(`[CRISTIAN STEP 3/5] ${targetNodeId} received TIME_RESPONSE (T1 = ${new Date(t1).toISOString().split('T')[1]}). RTT = ${rtt}ms, Estimated one-way delay = ${this.stepState.data.estimatedDelay}ms`);
        break;

      case 4:
        // Step 4: Calculate corrected time & correction offset
        const estimatedCorrectTime = this.stepState.data.tServer + this.stepState.data.estimatedDelay;
        const correctionMs = estimatedCorrectTime - this.stepState.data.t1;
        this.stepState.data.estimatedCorrectTime = estimatedCorrectTime;
        this.stepState.data.correctionMs = correctionMs;
        this.stepState.data.correctionSec = (correctionMs / 1000).toFixed(3);
        this.logClockEvent(`[CRISTIAN STEP 4/5] Estimated Correct Time = ${new Date(estimatedCorrectTime).toISOString().split('T')[1]}. Required Correction = ${this.stepState.data.correctionSec}s`);
        break;

      case 5:
        // Step 5: Apply correction to simulated physical clock
        const oldOff = node.offsetMs;
        node.offsetMs += this.stepState.data.correctionMs;
        node.status = 'SYNCHRONIZED';
        node.lastCorrectionMs = this.stepState.data.correctionMs;
        node.syncCount++;
        this.stepState.completed = true;

        this.lastCristianResult = {
          targetNodeId,
          timeServer: 'VTS',
          t0: this.stepState.data.t0,
          tServer: this.stepState.data.tServer,
          t1: this.stepState.data.t1,
          rtt: this.stepState.data.rtt,
          estimatedOneWayDelay: this.stepState.data.estimatedDelay,
          estimatedCorrectTime: this.stepState.data.estimatedCorrectTime,
          nodeTimeAtT1: this.stepState.data.t1,
          oldOffsetMs: oldOff,
          newOffsetMs: node.offsetMs,
          correctionMs: this.stepState.data.correctionMs,
          correctionSec: this.stepState.data.correctionSec,
          timestamp: new Date().toISOString()
        };

        this.logClockEvent(`[CRISTIAN STEP 5/5] Correction applied to ${targetNodeId}. Node physical clock is now SYNCHRONIZED with VTS!`);
        break;
    }

    this.broadcastState();
    return this.stepState;
  }

  stepBerkeley() {
    const allNodeIds = ['VTS', 'Peer-1', 'Peer-2', 'Edge-1', 'CDN-1'];
    const now = Date.now();

    switch (this.stepState.currentStep) {
      case 1:
        // Step 1: Coordinator polls nodes
        this.stepState.data = { coordinator: 'VTS', polled: [] };
        this.logClockEvent(`[BERKELEY STEP 1/5] VTS Coordinator broadcasting CLOCK_POLL_REQUEST to all nodes`);
        break;

      case 2:
        // Step 2: Collect all node clocks
        const readings = {};
        let sum = 0;
        allNodeIds.forEach(id => {
          const t = now + this.nodes[id].offsetMs;
          readings[id] = { time: t, offsetMs: this.nodes[id].offsetMs };
          sum += t;
        });
        this.stepState.data.readings = readings;
        this.stepState.data.sum = sum;
        this.logClockEvent(`[BERKELEY STEP 2/5] VTS received clock readings from all 5 nodes`);
        break;

      case 3:
        // Step 3: Calculate average
        const avg = Math.round(this.stepState.data.sum / allNodeIds.length);
        this.stepState.data.averageTime = avg;
        this.stepState.data.averageFormatted = new Date(avg).toISOString().split('T')[1];
        this.logClockEvent(`[BERKELEY STEP 3/5] Coordinator computed Average Time = ${this.stepState.data.averageFormatted}`);
        break;

      case 4:
        // Step 4: Calculate adjustments
        const adjustments = {};
        allNodeIds.forEach(id => {
          const initTime = this.stepState.data.readings[id].time;
          const adj = this.stepState.data.averageTime - initTime;
          adjustments[id] = {
            adjustmentMs: adj,
            adjustmentSec: (adj / 1000).toFixed(3)
          };
        });
        this.stepState.data.adjustments = adjustments;
        this.logClockEvent(`[BERKELEY STEP 4/5] Coordinator calculated adjustments for each node`);
        break;

      case 5:
        // Step 5: Send and apply adjustments
        const postSync = {};
        allNodeIds.forEach(id => {
          const node = this.nodes[id];
          const adj = this.stepState.data.adjustments[id].adjustmentMs;
          node.offsetMs += adj;
          node.status = 'SYNCHRONIZED';
          node.lastCorrectionMs = adj;
          node.syncCount++;
          postSync[id] = {
            finalTime: now + node.offsetMs,
            finalOffsetMs: node.offsetMs
          };
        });
        this.stepState.data.postSync = postSync;
        this.stepState.completed = true;

        this.lastBerkeleyResult = {
          coordinator: 'VTS',
          polledClocks: this.stepState.data.readings,
          averageTime: this.stepState.data.averageTime,
          averageFormatted: this.stepState.data.averageFormatted,
          adjustments: this.stepState.data.adjustments,
          postSyncClocks: postSync,
          timestamp: new Date().toISOString()
        };

        this.logClockEvent(`[BERKELEY STEP 5/5] All nodes applied adjustments and are now SYNCHRONIZED`);
        break;
    }

    this.broadcastState();
    return this.stepState;
  }

  stepLamport() {
    switch (this.stepState.currentStep) {
      case 1: {
        // Step 1: Local event at Peer-1
        const r1 = this.recordLamportLocalEvent('Peer-1', 'CLIENT_REQUEST', { step: 1 });
        this.stepState.data = { step: 1, event: r1, description: 'Peer-1 triggers local CLIENT_REQUEST event' };
        break;
      }
      case 2: {
        // Step 2: Peer-1 sends REQUEST to VTS
        this.lamportClocks['Peer-1'] += 1;
        const lSend = this.lamportClocks['Peer-1'];
        const sendRecord = {
          id: this.lamportEvents.length + 1,
          nodeId: 'Peer-1',
          targetNodeId: 'VTS',
          eventType: 'SEND_REQUEST',
          category: 'MESSAGE_SEND',
          lamportTime: lSend,
          details: { sentWithL: lSend, msg: 'STREAMING_REQUEST' },
          timestamp: new Date().toISOString()
        };
        this.lamportEvents.unshift(sendRecord);
        this.stepState.data = { step: 2, lSend, description: `Peer-1 dispatches REQUEST [L=${lSend}] -> VTS` };
        this.logClockEvent(`[LAMPORT STEP 2/5] Peer-1 dispatches REQUEST with timestamp [L=${lSend}]`);
        break;
      }
      case 3: {
        // Step 3: VTS receives REQUEST and updates counter
        const prevVts = this.lamportClocks['VTS'];
        const lSend = this.stepState.data?.lSend || (this.lamportClocks['Peer-1'] || 1);
        this.lamportClocks['VTS'] = Math.max(prevVts, lSend) + 1;
        const lVts = this.lamportClocks['VTS'];
        const recvRecord = {
          id: this.lamportEvents.length + 1,
          nodeId: 'VTS',
          senderNodeId: 'Peer-1',
          eventType: 'RECEIVE_REQUEST',
          category: 'MESSAGE_RECEIVE',
          lamportTime: lVts,
          details: { receivedMsgL: lSend, prevLocalL: prevVts },
          timestamp: new Date().toISOString()
        };
        this.lamportEvents.unshift(recvRecord);
        this.stepState.data = { step: 3, lVts, lSend, description: `VTS receives REQUEST: L_vts = max(${prevVts}, ${lSend}) + 1 = ${lVts}` };
        this.logClockEvent(`[LAMPORT STEP 3/5] VTS receives REQUEST: L_vts = max(${prevVts}, ${lSend}) + 1 = ${lVts}`);
        break;
      }
      case 4: {
        // Step 4: VTS local allocation event
        const ev = this.recordLamportLocalEvent('VTS', 'VTS_ALLOCATION', { step: 4, allocatedSource: 'Peer-1' });
        this.stepState.data = { step: 4, event: ev, lAlloc: ev.lamportTime, description: `VTS executes VTS_ALLOCATION: L_vts = ${ev.lamportTime}` };
        break;
      }
      case 5: {
        // Step 5: VTS sends ALLOCATION to Peer-1, Peer-1 receives
        const prevPeer = this.lamportClocks['Peer-1'];
        const lAlloc = this.stepState.data?.lAlloc || this.lamportClocks['VTS'];
        this.lamportClocks['Peer-1'] = Math.max(prevPeer, lAlloc) + 1;
        const lPeerRecv = this.lamportClocks['Peer-1'];
        const recvRecord = {
          id: this.lamportEvents.length + 1,
          nodeId: 'Peer-1',
          senderNodeId: 'VTS',
          eventType: 'RECEIVE_ALLOCATION',
          category: 'MESSAGE_RECEIVE',
          lamportTime: lPeerRecv,
          details: { receivedMsgL: lAlloc, prevLocalL: prevPeer },
          timestamp: new Date().toISOString()
        };
        this.lamportEvents.unshift(recvRecord);
        this.stepState.completed = true;
        this.stepState.data = { step: 5, lPeerRecv, lAlloc, description: `Peer-1 receives ALLOCATION: L_peer = max(${prevPeer}, ${lAlloc}) + 1 = ${lPeerRecv}` };
        this.logClockEvent(`[LAMPORT STEP 5/5] Peer-1 receives ALLOCATION: L_peer = max(${prevPeer}, ${lAlloc}) + 1 = ${lPeerRecv}`);
        break;
      }
    }

    this.broadcastState();
    return this.stepState;
  }
}

export { ClockManager };
export default ClockManager;
