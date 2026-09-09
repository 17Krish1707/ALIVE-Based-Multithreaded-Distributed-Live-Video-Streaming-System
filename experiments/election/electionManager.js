/**
 * ElectionManager - Orchestrates Real Bully and Ring Distributed Election Algorithms
 * 
 * Interacts with:
 * - Shared streaming sources (Peer-1, Peer-2, Edge-1, CDN-1)
 * - Real Socket.io events
 * - Real-time terminal/activity logs
 * - SQLite database persistence (election_history & election_messages)
 * - VTS dynamic source failover
 */

import { NodeAgent } from './nodeAgent.js';
import { 
  saveElectionRecord, 
  saveElectionMessage, 
  getElectionHistory, 
  getElectionMessages 
} from '../../db.js';

// Order of nodes in logical ring topology
const LOGICAL_RING_ORDER = ['Peer-1', 'Peer-2', 'Edge-1', 'CDN-1'];

// Initial node specs
const NODE_SPECS = [
  { id: 'Peer-1', name: 'Peer-1', type: 'P2P Peer', electionId: 1, isCoordinator: false },
  { id: 'Peer-2', name: 'Peer-2', type: 'P2P Peer', electionId: 2, isCoordinator: false },
  { id: 'Edge-1', name: 'Edge-1', type: 'Edge Server', electionId: 3, isCoordinator: false },
  { id: 'CDN-1',  name: 'CDN-1',  type: 'CDN Node',   electionId: 4, isCoordinator: true } // Default initial coordinator
];

export class ElectionManager {
  constructor(sharedSources = [], io = null, logEventFn = console.log, onSourceFailoverFn = null) {
    this.sharedSources = sharedSources;
    this.io = io;
    this.logEvent = logEventFn;
    this.onSourceFailover = onSourceFailoverFn;

    // Node Agents map
    this.nodeAgents = new Map();
    for (const spec of NODE_SPECS) {
      const agent = new NodeAgent({
        ...spec,
        online: true
      });
      this.nodeAgents.set(spec.id, agent);
    }

    // Coordinator & Algorithm State
    this.currentCoordinator = 'CDN-1';
    this.coordinatorElectionId = 4;
    this.currentAlgorithm = 'BULLY';
    this.autoElection = false; // Default OFF per requirements
    this.recoveryPolicy = 'KEEP'; // 'KEEP' | 'TRIGGER_ELECTION'
    this.isElectionRunning = false;
    this.coordinatorFailureDetected = false;
    this.messageDelayMs = 350; // Delay for visual demonstration & non-blocking step pacing

    // Telemetry & Logs
    this.electionLogs = [];
    this.recentMessages = [];
    this.lastBullyResult = null;
    this.lastRingResult = null;

    // Heartbeat configuration
    this.heartbeatIntervalMs = 1500;
    this.heartbeatTimeoutMs = 4000;
    this.heartbeatTimer = null;

    // Sync sources with agent states
    this.syncWithSources();

    // Start background heartbeat monitor
    this.startHeartbeatMonitor();
  }

  setIO(io) {
    this.io = io;
  }

  setLogFn(fn) {
    this.logEvent = fn;
  }

  setOnSourceFailover(fn) {
    this.onSourceFailover = fn;
  }

  logElectionEvent(msg, broadcastToTerminal = true) {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] ${msg}`;
    this.electionLogs.push(formatted);
    if (this.electionLogs.length > 250) {
      this.electionLogs.shift();
    }

    console.log(msg);

    if (this.logEvent && broadcastToTerminal) {
      this.logEvent(msg, true);
    }

    if (this.io) {
      this.io.emit('election_log', formatted);
    }
  }

  syncWithSources() {
    for (const src of this.sharedSources) {
      const agent = this.nodeAgents.get(src.id);
      if (agent) {
        agent.online = src.online !== false;
      }
    }
  }

  /**
   * Heartbeat monitor daemon
   */
  startHeartbeatMonitor() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const heartbeatData = [];

      for (const agent of this.nodeAgents.values()) {
        const hb = agent.emitHeartbeat();
        heartbeatData.push(hb);

        // Check if node is marked online but timed out
        if (agent.online && (now - agent.lastHeartbeat > this.heartbeatTimeoutMs)) {
          agent.heartbeatStatus = 'MISSED';
        }
      }

      // Check coordinator health
      const coordAgent = this.nodeAgents.get(this.currentCoordinator);
      const coordOffline = !coordAgent || !coordAgent.online;

      if (coordOffline && !this.coordinatorFailureDetected) {
        this.coordinatorFailureDetected = true;
        this.logElectionEvent(`[FAILURE DETECTOR] Coordinator ${this.currentCoordinator} unavailable / heartbeat lost!`);

        if (this.io) {
          this.io.emit('election:coordinator-failed', {
            previousCoordinator: this.currentCoordinator,
            timestamp: new Date().toISOString(),
            autoElection: this.autoElection
          });
        }

        // If AUTO ELECTION is enabled, select initiator and start election
        if (this.autoElection && !this.isElectionRunning) {
          const validInitiator = this.findFirstOnlineCandidate();
          if (validInitiator) {
            this.logElectionEvent(`[AUTO ELECTION] Triggering ${this.currentAlgorithm} election with initiator ${validInitiator.id}...`);
            this.startElection(this.currentAlgorithm, validInitiator.id).catch(err => {
              console.error('[AUTO ELECTION] Run error:', err);
            });
          }
        }
      }

      if (this.io) {
        this.io.emit('election:heartbeat', {
          nodes: this.getNodesData(),
          coordinator: this.currentCoordinator,
          coordinatorFailureDetected: this.coordinatorFailureDetected,
          timestamp: now
        });
      }
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeatMonitor() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Fail a node (integrated with streaming sources and VTS)
   */
  async failNode(nodeId) {
    const agent = this.nodeAgents.get(nodeId);
    if (!agent) throw new Error(`Node ${nodeId} not found`);

    agent.setOnline(false);

    // Update shared source in streaming system
    const src = this.sharedSources.find(s => s.id === nodeId);
    if (src) {
      src.online = false;
    }

    this.logElectionEvent(`[NODE FAILURE] ${nodeId} OFFLINE`);

    // Check if failed node was coordinator
    const wasCoordinator = (this.currentCoordinator === nodeId);
    if (wasCoordinator) {
      this.coordinatorFailureDetected = true;
      this.logElectionEvent(`[FAILURE DETECTOR] Coordinator ${nodeId} failure detected.`);
    }

    // Trigger VTS streaming failover if connected clients exist on this node
    if (this.onSourceFailover && src && src.connected > 0) {
      this.logElectionEvent(`[STREAM FAILOVER] Node ${nodeId} has ${src.connected} active streaming clients. Initiating VTS reallocation...`);
      try {
        await this.onSourceFailover(nodeId);
      } catch (err) {
        console.error('[ELECTION FAILOVER] Source failover error:', err);
      }
    }

    // Broadcast node failure
    if (this.io) {
      this.io.emit('election:node-failed', {
        nodeId,
        wasCoordinator,
        nodes: this.getNodesData(),
        coordinatorFailureDetected: this.coordinatorFailureDetected
      });
    }

    // Auto-election trigger if coordinator failed and auto mode is on
    if (wasCoordinator && this.autoElection && !this.isElectionRunning) {
      const initiator = this.findFirstOnlineCandidate();
      if (initiator) {
        setTimeout(() => {
          this.startElection(this.currentAlgorithm, initiator.id).catch(e => console.error(e));
        }, 500);
      }
    }

    return {
      success: true,
      nodeId,
      wasCoordinator,
      coordinatorFailureDetected: this.coordinatorFailureDetected
    };
  }

  /**
   * Recover a node
   */
  async recoverNode(nodeId) {
    const agent = this.nodeAgents.get(nodeId);
    if (!agent) throw new Error(`Node ${nodeId} not found`);

    agent.setOnline(true);

    const src = this.sharedSources.find(s => s.id === nodeId);
    if (src) {
      src.online = true;
    }

    this.logElectionEvent(`[NODE RECOVERY] ${nodeId} RECOVERED (ONLINE)`);

    let electionTriggered = false;

    // Check higher-priority recovery rule
    if (agent.electionId > this.coordinatorElectionId && !this.isElectionRunning) {
      if (this.recoveryPolicy === 'TRIGGER_ELECTION') {
        this.logElectionEvent(`[RECOVERY POLICY] Higher-priority node ${nodeId} recovered. Triggering election per policy...`);
        electionTriggered = true;
        setTimeout(() => {
          this.startElection(this.currentAlgorithm, nodeId).catch(e => console.error(e));
        }, 500);
      } else {
        this.logElectionEvent(`[RECOVERY POLICY] Higher-priority node ${nodeId} recovered, but policy is [Keep Current Coordinator]. Current coordinator remains ${this.currentCoordinator}.`);
      }
    }

    if (this.io) {
      this.io.emit('election:node-recovered', {
        nodeId,
        nodes: this.getNodesData(),
        currentCoordinator: this.currentCoordinator
      });
    }

    return {
      success: true,
      nodeId,
      electionTriggered,
      currentCoordinator: this.currentCoordinator
    };
  }

  findFirstOnlineCandidate() {
    for (const spec of NODE_SPECS) {
      const agent = this.nodeAgents.get(spec.id);
      if (agent && agent.online) {
        return agent;
      }
    }
    return null;
  }

  /**
   * Start Election (Bully or Ring)
   */
  async startElection(algorithm = 'BULLY', initiatorId = 'Peer-1') {
    const algo = (algorithm || 'BULLY').toUpperCase();
    this.currentAlgorithm = algo;

    if (this.isElectionRunning) {
      throw new Error('An election is already in progress.');
    }

    const initiator = this.nodeAgents.get(initiatorId);
    if (!initiator) {
      throw new Error(`Initiator node ${initiatorId} does not exist.`);
    }
    if (!initiator.online) {
      throw new Error(`Initiator node ${initiatorId} is OFFLINE. Choose an ONLINE node.`);
    }

    const onlineNodes = Array.from(this.nodeAgents.values()).filter(a => a.online);
    if (onlineNodes.length === 0) {
      throw new Error('Cannot start election: No online nodes available.');
    }

    this.isElectionRunning = true;
    const electionSessionId = Date.now();
    const startTime = Date.now();
    const previousCoordinator = this.currentCoordinator;

    this.logElectionEvent(`\n============================================================`);
    this.logElectionEvent(`[ELECTION] Algorithm = ${algo}`);
    this.logElectionEvent(`[ELECTION] Initiator = ${initiator.id} (ID=${initiator.electionId})`);
    this.logElectionEvent(`============================================================`);

    if (this.io) {
      this.io.emit('election:started', {
        algorithm: algo,
        initiatorId: initiator.id,
        initiatorElectionId: initiator.electionId,
        previousCoordinator,
        timestamp: new Date().toISOString()
      });
    }

    try {
      let result;
      if (algo === 'BULLY') {
        result = await this.executeBullyAlgorithm(initiator, electionSessionId, previousCoordinator, startTime);
      } else {
        result = await this.executeRingAlgorithm(initiator, electionSessionId, previousCoordinator, startTime);
      }

      this.isElectionRunning = false;
      return result;
    } catch (err) {
      this.isElectionRunning = false;
      this.logElectionEvent(`[ELECTION ERROR] Execution failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Helper sleep for realistic message passing delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Bully Algorithm Execution
   */
  async executeBullyAlgorithm(initiator, electionSessionId, previousCoordinator, startTime) {
    const messages = [];
    let electionMessageCount = 0;
    let okMessageCount = 0;
    let coordinatorMessageCount = 0;
    const participants = new Set([initiator.id]);

    let highestOnlineAgent = initiator;

    // Helper to send and record message
    const dispatchMessage = async (msg) => {
      messages.push(msg);
      this.recentMessages.push(msg);
      if (this.recentMessages.length > 100) this.recentMessages.shift();

      if (msg.type === 'ELECTION') electionMessageCount++;
      else if (msg.type === 'OK') okMessageCount++;
      else if (msg.type === 'COORDINATOR') coordinatorMessageCount++;

      // Terminal and system logging
      if (msg.type === 'ELECTION') {
        this.logElectionEvent(`[ELECTION][BULLY] ${msg.from}(ID=${msg.fromElectionId}) -> ${msg.to}(ID=${msg.toElectionId})\nMessage: ELECTION`);
      } else if (msg.type === 'OK') {
        this.logElectionEvent(`[ELECTION][BULLY] ${msg.from} -> ${msg.to}\nMessage: OK`);
      } else if (msg.type === 'COORDINATOR') {
        this.logElectionEvent(`[ELECTION][BULLY] ${msg.from} -> ${msg.to}\nMessage: COORDINATOR`);
      }

      if (this.io) {
        this.io.emit('election:message', msg);
      }

      // Persist to DB
      await saveElectionMessage({
        election_id: electionSessionId,
        algorithm: 'BULLY',
        message_type: msg.type,
        sender: msg.from,
        receiver: msg.to,
        payload: msg,
        timestamp: msg.timestamp
      });

      await this.sleep(this.messageDelayMs);
    };

    // Step 1: Initiator sends ELECTION to all higher candidate IDs
    const higherNodes = Array.from(this.nodeAgents.values()).filter(a => a.electionId > initiator.electionId);

    const respondingHigherAgents = [];

    for (const target of higherNodes) {
      participants.add(target.id);
      const electMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        electionSessionId,
        algorithm: 'BULLY',
        type: 'ELECTION',
        from: initiator.id,
        fromElectionId: initiator.electionId,
        to: target.id,
        toElectionId: target.electionId,
        timestamp: new Date().toISOString()
      };
      await dispatchMessage(electMsg);

      // Check if target is online and responds with OK
      const reply = target.receiveBullyElection(initiator.id, initiator.electionId);
      if (reply) {
        await dispatchMessage(reply);
        respondingHigherAgents.push(target);
      } else {
        this.logElectionEvent(`[ELECTION][BULLY] ${target.id} is OFFLINE (No response)`);
      }
    }

    // Step 2: Higher responding nodes continue the election
    if (respondingHigherAgents.length > 0) {
      for (const node of respondingHigherAgents) {
        const nextHigherNodes = Array.from(this.nodeAgents.values()).filter(a => a.electionId > node.electionId);
        let receivedAnyOk = false;

        for (const nextTarget of nextHigherNodes) {
          participants.add(nextTarget.id);
          const nextElectMsg = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            electionSessionId,
            algorithm: 'BULLY',
            type: 'ELECTION',
            from: node.id,
            fromElectionId: node.electionId,
            to: nextTarget.id,
            toElectionId: nextTarget.electionId,
            timestamp: new Date().toISOString()
          };
          await dispatchMessage(nextElectMsg);

          const reply = nextTarget.receiveBullyElection(node.id, node.electionId);
          if (reply) {
            await dispatchMessage(reply);
            receivedAnyOk = true;
          } else {
            this.logElectionEvent(`[ELECTION][BULLY] ${nextTarget.id} is OFFLINE (No response)`);
          }
        }

        if (!receivedAnyOk && node.online) {
          highestOnlineAgent = node;
        }
      }
    } else {
      highestOnlineAgent = initiator;
    }

    // Identify final highest online process
    const finalOnlineAgents = Array.from(this.nodeAgents.values()).filter(a => a.online);
    finalOnlineAgents.sort((a, b) => b.electionId - a.electionId);
    highestOnlineAgent = finalOnlineAgents[0];

    this.logElectionEvent(`[ELECTION][BULLY] ${highestOnlineAgent.id} detected no higher ONLINE process`);
    this.logElectionEvent(`[ELECTION][BULLY] NEW COORDINATOR: ${highestOnlineAgent.id} (ID=${highestOnlineAgent.electionId})`);

    // Step 3: Highest node declares itself coordinator and announces to all active nodes
    for (const agent of this.nodeAgents.values()) {
      agent.receiveCoordinatorAnnouncement(highestOnlineAgent.id, highestOnlineAgent.electionId, 'BULLY');
    }

    this.currentCoordinator = highestOnlineAgent.id;
    this.coordinatorElectionId = highestOnlineAgent.electionId;
    this.coordinatorFailureDetected = false;

    // Send COORDINATOR announcement message to all other active nodes
    for (const agent of this.nodeAgents.values()) {
      if (agent.id !== highestOnlineAgent.id && agent.online) {
        const coordMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          electionSessionId,
          algorithm: 'BULLY',
          type: 'COORDINATOR',
          from: highestOnlineAgent.id,
          fromElectionId: highestOnlineAgent.electionId,
          to: agent.id,
          coordinatorId: highestOnlineAgent.id,
          coordinatorElectionId: highestOnlineAgent.electionId,
          timestamp: new Date().toISOString()
        };
        await dispatchMessage(coordMsg);
      }
    }

    const durationMs = Date.now() - startTime;
    const totalMessages = messages.length;

    const resultRecord = {
      algorithm: 'BULLY',
      initiator: initiator.id,
      previous_coordinator: previousCoordinator,
      new_coordinator: highestOnlineAgent.id,
      new_coordinator_id: highestOnlineAgent.electionId,
      reason: 'Coordinator failure detected / Election triggered',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      message_count: totalMessages,
      breakdown: {
        election: electionMessageCount,
        ok: okMessageCount,
        coordinator: coordinatorMessageCount
      },
      participants: Array.from(participants),
      status: 'SUCCESS'
    };

    // Save record to DB
    const recordId = await saveElectionRecord(resultRecord);
    resultRecord.id = recordId;
    this.lastBullyResult = resultRecord;

    this.logElectionEvent(`[COORDINATOR] Current Coordinator = ${this.currentCoordinator} (ID=${this.coordinatorElectionId})`);
    this.logElectionEvent(`[STREAM] Distributed live video streaming continues unaffected.`);

    if (this.io) {
      this.io.emit('election:coordinator', {
        coordinatorId: highestOnlineAgent.id,
        coordinatorElectionId: highestOnlineAgent.electionId,
        algorithm: 'BULLY'
      });

      this.io.emit('election:completed', resultRecord);
    }

    return resultRecord;
  }

  /**
   * Ring Algorithm Execution
   */
  async executeRingAlgorithm(initiator, electionSessionId, previousCoordinator, startTime) {
    const messages = [];
    const participants = new Set([initiator.id]);

    const dispatchRingMessage = async (msg) => {
      messages.push(msg);
      this.recentMessages.push(msg);
      if (this.recentMessages.length > 100) this.recentMessages.shift();

      if (msg.type === 'ELECTION_TOKEN') {
        this.logElectionEvent(`[ELECTION][RING] Token forwarded: ${msg.from} -> ${msg.to}\nToken Payload: [${msg.ids.join(', ')}]`);
      } else if (msg.type === 'COORDINATOR_TOKEN') {
        this.logElectionEvent(`[ELECTION][RING] Coordinator Token: ${msg.from} -> ${msg.to}\nLeader: ${msg.coordinatorId} (ID=${msg.coordinatorElectionId})`);
      }

      if (this.io) {
        this.io.emit('election:message', msg);
      }

      await saveElectionMessage({
        election_id: electionSessionId,
        algorithm: 'RING',
        message_type: msg.type,
        sender: msg.from,
        receiver: msg.to,
        payload: msg,
        timestamp: msg.timestamp
      });

      await this.sleep(this.messageDelayMs);
    };

    // Logical Ring next online node finder
    const getNextOnlineNode = (currentNodeId) => {
      const total = LOGICAL_RING_ORDER.length;
      const currentIndex = LOGICAL_RING_ORDER.indexOf(currentNodeId);
      if (currentIndex === -1) return null;

      for (let i = 1; i <= total; i++) {
        const nextId = LOGICAL_RING_ORDER[(currentIndex + i) % total];
        const nextAgent = this.nodeAgents.get(nextId);
        if (nextAgent && nextAgent.online) {
          return nextAgent;
        } else if (nextAgent && !nextAgent.online) {
          this.logElectionEvent(`[ELECTION][RING] Node ${nextId} is OFFLINE -> skipping to next online node`);
        }
      }
      return null;
    };

    // Phase 1: Election Token Circulation
    let currentToken = {
      electionSessionId,
      algorithm: 'RING',
      type: 'ELECTION_TOKEN',
      initiator: initiator.id,
      ids: [initiator.electionId],
      route: [initiator.id],
      timestamp: new Date().toISOString()
    };

    let currentNode = initiator;
    let completedCircle = false;
    let hopCount = 0;
    const maxHops = 10; // Safety guard

    while (!completedCircle && hopCount < maxHops) {
      hopCount++;
      const nextNode = getNextOnlineNode(currentNode.id);
      if (!nextNode) {
        throw new Error('Ring broken: No active neighbors found.');
      }

      participants.add(nextNode.id);

      const tokenMsg = {
        ...currentToken,
        from: currentNode.id,
        to: nextNode.id,
        timestamp: new Date().toISOString()
      };
      await dispatchRingMessage(tokenMsg);

      if (nextNode.id === initiator.id) {
        // Token has completed full circle back to initiator
        completedCircle = true;
        currentToken.route.push(initiator.id);
        this.logElectionEvent(`[ELECTION][RING] Token returned to initiator ${initiator.id}. Collected candidate IDs: [${currentToken.ids.join(', ')}]`);
        break;
      } else {
        // Next node processes token
        currentToken = nextNode.receiveRingElectionToken(currentToken);
        currentNode = nextNode;
      }
    }

    // Determine winner: maximum ID in token.ids
    const winningElectionId = Math.max(...currentToken.ids);
    const winningAgent = Array.from(this.nodeAgents.values()).find(a => a.electionId === winningElectionId && a.online);

    if (!winningAgent) {
      throw new Error(`Winner with election ID ${winningElectionId} is no longer online.`);
    }

    this.logElectionEvent(`[ELECTION][RING] Winner: ${winningAgent.id} (max ID=${winningAgent.electionId})`);

    // Phase 2: Coordinator Announcement Token Circulation
    let coordToken = {
      electionSessionId,
      algorithm: 'RING',
      type: 'COORDINATOR_TOKEN',
      coordinatorId: winningAgent.id,
      coordinatorElectionId: winningAgent.electionId,
      initiator: winningAgent.id,
      route: [winningAgent.id],
      timestamp: new Date().toISOString()
    };

    let coordCurrentNode = winningAgent;
    let coordCircle = false;
    let coordHops = 0;

    while (!coordCircle && coordHops < maxHops) {
      coordHops++;
      const nextNode = getNextOnlineNode(coordCurrentNode.id);
      if (!nextNode) break;

      const coordMsg = {
        ...coordToken,
        from: coordCurrentNode.id,
        to: nextNode.id,
        timestamp: new Date().toISOString()
      };
      await dispatchRingMessage(coordMsg);

      nextNode.receiveRingCoordinatorToken(coordToken);

      if (nextNode.id === winningAgent.id) {
        coordCircle = true;
        break;
      } else {
        coordCurrentNode = nextNode;
      }
    }

    this.currentCoordinator = winningAgent.id;
    this.coordinatorElectionId = winningAgent.electionId;
    this.coordinatorFailureDetected = false;

    for (const agent of this.nodeAgents.values()) {
      agent.isCoordinator = (agent.id === winningAgent.id);
    }

    this.logElectionEvent(`[ELECTION][RING] NEW COORDINATOR: ${winningAgent.id} (ID=${winningAgent.electionId})`);

    const durationMs = Date.now() - startTime;
    const totalMessages = messages.length;

    const resultRecord = {
      algorithm: 'RING',
      initiator: initiator.id,
      previous_coordinator: previousCoordinator,
      new_coordinator: winningAgent.id,
      new_coordinator_id: winningAgent.electionId,
      reason: 'Coordinator failure detected / Election triggered',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      message_count: totalMessages,
      token_route: currentToken.route,
      participants: Array.from(participants),
      status: 'SUCCESS'
    };

    const recordId = await saveElectionRecord(resultRecord);
    resultRecord.id = recordId;
    this.lastRingResult = resultRecord;

    this.logElectionEvent(`[COORDINATOR] Current Coordinator = ${this.currentCoordinator} (ID=${this.coordinatorElectionId})`);
    this.logElectionEvent(`[STREAM] Distributed live video streaming continues unaffected.`);

    if (this.io) {
      this.io.emit('election:coordinator', {
        coordinatorId: winningAgent.id,
        coordinatorElectionId: winningAgent.electionId,
        algorithm: 'RING'
      });

      this.io.emit('election:completed', resultRecord);
    }

    return resultRecord;
  }

  /**
   * Reset experiment nodes and coordinator back to clean baseline
   */
  resetAll() {
    for (const spec of NODE_SPECS) {
      const agent = this.nodeAgents.get(spec.id);
      if (agent) {
        agent.online = true;
        agent.isCoordinator = (spec.id === 'CDN-1');
        agent.heartbeatStatus = 'ACTIVE';
        agent.lastHeartbeat = Date.now();
        agent.electionState = agent.isCoordinator ? 'COORDINATOR' : 'IDLE';
      }
      const src = this.sharedSources.find(s => s.id === spec.id);
      if (src) {
        src.online = true;
      }
    }

    this.currentCoordinator = 'CDN-1';
    this.coordinatorElectionId = 4;
    this.coordinatorFailureDetected = false;
    this.isElectionRunning = false;

    this.logElectionEvent('[ELECTION] Distributed election state reset to baseline (CDN-1 is coordinator).');

    if (this.io) {
      this.io.emit('election:state', this.getState());
    }

    return this.getState();
  }

  setConfig({ autoElection, recoveryPolicy, messageDelayMs }) {
    if (autoElection !== undefined) this.autoElection = !!autoElection;
    if (recoveryPolicy !== undefined) this.recoveryPolicy = recoveryPolicy;
    if (messageDelayMs !== undefined) this.messageDelayMs = Math.max(50, Math.min(2000, Number(messageDelayMs) || 350));

    this.logElectionEvent(`[ELECTION CONFIG] Auto: ${this.autoElection ? 'ON' : 'OFF'}, Recovery: ${this.recoveryPolicy}, Delay: ${this.messageDelayMs}ms`);

    if (this.io) {
      this.io.emit('election:state', this.getState());
    }

    return this.getState();
  }

  getNodesData() {
    const list = [];
    for (const spec of NODE_SPECS) {
      const agent = this.nodeAgents.get(spec.id);
      const src = this.sharedSources.find(s => s.id === spec.id) || {};
      if (agent) {
        list.push({
          ...agent.getState(),
          capacity: src.capacity || 1,
          connected: src.connected || 0,
          latency: src.latency || 20
        });
      }
    }
    return list;
  }

  getState() {
    return {
      currentCoordinator: this.currentCoordinator,
      coordinatorElectionId: this.coordinatorElectionId,
      coordinatorFailureDetected: this.coordinatorFailureDetected,
      currentAlgorithm: this.currentAlgorithm,
      autoElection: this.autoElection,
      recoveryPolicy: this.recoveryPolicy,
      isElectionRunning: this.isElectionRunning,
      messageDelayMs: this.messageDelayMs,
      nodes: this.getNodesData(),
      ringOrder: LOGICAL_RING_ORDER,
      lastBullyResult: this.lastBullyResult,
      lastRingResult: this.lastRingResult,
      recentMessages: this.recentMessages.slice(-20)
    };
  }

  getComparison() {
    return {
      bully: this.lastBullyResult,
      ring: this.lastRingResult
    };
  }
}

export default ElectionManager;
