/**
 * NodeAgent - Represents an independent logical node in the distributed system.
 * 
 * Participating Nodes:
 * - Peer-1 (Election ID: 1, Type: P2P Peer)
 * - Peer-2 (Election ID: 2, Type: P2P Peer)
 * - Edge-1 (Election ID: 3, Type: Edge Server)
 * - CDN-1  (Election ID: 4, Type: CDN Node, Default Initial Coordinator)
 */

export class NodeAgent {
  constructor(config) {
    this.id = config.id;
    this.name = config.name || config.id;
    this.type = config.type || 'P2P Peer';
    this.electionId = config.electionId;
    this.online = config.online !== undefined ? config.online : true;
    this.isCoordinator = config.isCoordinator || false;
    this.lastHeartbeat = Date.now();
    this.heartbeatStatus = 'ACTIVE';
    this.electionState = 'IDLE'; // 'IDLE' | 'ELECTION_IN_PROGRESS' | 'COORDINATOR'
  }

  /**
   * Generates a heartbeat telemetry packet
   */
  emitHeartbeat() {
    if (!this.online) {
      this.heartbeatStatus = 'LOST';
      return {
        nodeId: this.id,
        electionId: this.electionId,
        online: false,
        isCoordinator: this.isCoordinator,
        status: 'LOST',
        timestamp: this.lastHeartbeat
      };
    }

    this.lastHeartbeat = Date.now();
    this.heartbeatStatus = 'ACTIVE';
    return {
      nodeId: this.id,
      electionId: this.electionId,
      online: true,
      isCoordinator: this.isCoordinator,
      status: 'ACTIVE',
      timestamp: this.lastHeartbeat
    };
  }

  /**
   * Bully Algorithm: Handle incoming ELECTION message
   * A node with higher ID responds with OK if it is online.
   */
  receiveBullyElection(fromNodeId, fromElectionId) {
    if (!this.online) {
      return null; // Offline nodes cannot respond
    }

    if (this.electionId > fromElectionId) {
      return {
        type: 'OK',
        algorithm: 'BULLY',
        from: this.id,
        fromElectionId: this.electionId,
        to: fromNodeId,
        timestamp: new Date().toISOString()
      };
    }

    return null;
  }

  /**
   * Bully & Ring: Receive COORDINATOR announcement
   */
  receiveCoordinatorAnnouncement(coordinatorId, coordinatorElectionId, algorithm = 'BULLY') {
    this.isCoordinator = (this.id === coordinatorId || this.electionId === coordinatorElectionId);
    this.electionState = this.isCoordinator ? 'COORDINATOR' : 'IDLE';
    return {
      type: 'ACK',
      algorithm,
      nodeId: this.id,
      electionId: this.electionId,
      acceptedCoordinator: coordinatorId,
      isCoordinator: this.isCoordinator,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Ring Algorithm: Handle incoming Election Token
   */
  receiveRingElectionToken(token) {
    if (!this.online) {
      return null;
    }

    const updatedIds = [...token.ids];
    if (!updatedIds.includes(this.electionId)) {
      updatedIds.push(this.electionId);
    }

    const updatedRoute = [...(token.route || []), this.id];

    return {
      ...token,
      ids: updatedIds,
      route: updatedRoute,
      lastHop: this.id,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Ring Algorithm: Handle incoming Coordinator Token
   */
  receiveRingCoordinatorToken(token) {
    if (!this.online) {
      return null;
    }

    this.isCoordinator = (this.id === token.coordinatorId || this.electionId === token.coordinatorElectionId);
    this.electionState = this.isCoordinator ? 'COORDINATOR' : 'IDLE';

    const updatedRoute = [...(token.route || []), this.id];

    return {
      ...token,
      route: updatedRoute,
      lastHop: this.id,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Mark node state
   */
  setOnline(isOnline) {
    this.online = isOnline;
    if (!isOnline) {
      this.heartbeatStatus = 'LOST';
      this.electionState = 'OFFLINE';
      if (this.isCoordinator) {
        this.isCoordinator = false;
      }
    } else {
      this.lastHeartbeat = Date.now();
      this.heartbeatStatus = 'ACTIVE';
      this.electionState = 'IDLE';
    }
  }

  getState() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      electionId: this.electionId,
      online: this.online,
      isCoordinator: this.isCoordinator,
      lastHeartbeat: this.lastHeartbeat,
      heartbeatStatus: this.heartbeatStatus,
      electionState: this.electionState
    };
  }
}
export default NodeAgent;
