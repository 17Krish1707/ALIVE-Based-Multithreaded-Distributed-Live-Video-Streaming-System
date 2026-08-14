# ALIVE-Based Multithreaded Distributed Live Video Streaming System

A complete, web-based distributed live video streaming demonstration system built for a Distributed Computing course. This project models an ALIVE-style hybrid P2P-CDN streaming network topology, showcasing concurrent client request handling, Virtual Tracker Server (VTS) source allocation algorithms, real-time node failovers, and resource deadlock detection/prevention.

---

## 1. Project Architecture

The system coordinates stream deliveries across three logical layers:

```
                    ADMIN / SERVER DASHBOARD
                               |
                        Upload Live Video
                               |
                               v
                     VIRTUAL TRACKER SERVER (VTS)
                               |
               +---------------+---------------+
               |               |               |
               v               v               v
            PEERS         EDGE SERVER         CDN
          • Peer-1          • Edge-1        • CDN-1
          • Peer-2
               |
               +---------------+---------------+
                               |
                    3 CONCURRENT CLIENTS
                               |
               +---------------+---------------+
               |               |               |
               v               v               v
            Client-1        Client-2        Client-3
```

- **Virtual Tracker Server (VTS)**: Receives client streaming requests, tracks active online source capacities, monitors network latencies, handles allocations, and coordinates failovers.
- **Distributed Sources**:
  - **Peer-1 & Peer-2**: High-proximity nodes (P2P). Low simulated latency (20ms, 30ms) but limited capacity (1 client each).
  - **Edge-1**: Mid-tier CDN edge server. Moderate latency (50ms) and capacity (2 clients).
  - **CDN-1**: Master content distribution node. Higher latency (100ms) but large capacity (3 clients).
- **Concurrency worker pool**: Spawns independent Node `worker_threads` for each client watch session to process and deliver simulated video chunks concurrently.

---

## 2. Technologies Used

- **Backend**: Node.js (v18+ recommended) with ES Modules (ESM).
- **Web Server**: Express (HTTP API for file uploads and serving static pages).
- **Real-Time Communications**: Socket.io (WebSocket framework).
- **Database**: SQLite3 (State persistence and metrics archiving).
- **Frontend**: HTML5, Vanilla CSS (Glassmorphism design language), and Vanilla JS.
- **Threading**: Node `worker_threads` module.

---

## 3. Installation & Local Setup

### Prerequisites
- Node.js (v18.0.0 or higher)
- NPM (v9.0.0 or higher)

### Setup Steps
1. Navigate to the project directory:
   ```bash
   cd "c:\Users\Krish\OneDrive\Desktop\DC EXPERIMENTS"
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```

---

## 4. Environment Configuration

Create a `.env` file in the root directory (one is already auto-generated during setup) with these options:

```env
SERVER_PORT=3000
PUBLIC_URL=http://localhost:3000
```

- **`SERVER_PORT`**: Port number for Express and Socket.io.
- **`PUBLIC_URL`**: Public-facing address used for client redirect URLs.

---

## 5. Running the Application

### Start the Server
Run the startup script:
```bash
npm start
```
*Alternatively, you can run:*
```bash
node server.js
```
The server will initialize the SQLite database (`database.db`), seed the stream configurations, and bind to `http://localhost:3000`.

### Open Dashboards
- **Landing Gateway**: [http://localhost:3000/](http://localhost:3000/)
- **Admin Panel**: [http://localhost:3000/admin/index.html](http://localhost:3000/admin/index.html)
- **Client Player**: [http://localhost:3000/client/index.html](http://localhost:3000/client/index.html)

---

## 6. Testing with 3 Physical Devices

Because the backend is configured using standard relative WebSocket origins (`window.location.origin`), you can deploy this on a local network without hardcoding IPs or `localhost`:

1. **Find Server IP**: Open PowerShell/Terminal on the host computer running the server and find your local IP address (e.g., `192.168.1.15`):
   ```powershell
   ipconfig
   ```
2. **Connect Devices**: Connect your three laptops/devices to the same Wi-Fi/local network.
3. **Open Client UI**: On each of the three devices, open a web browser and navigate to:
   ```
   http://<YOUR-SERVER-IP>:3000/client/index.html
   ```
4. **Monitor**: Open `http://<YOUR-SERVER-IP>:3000/admin/index.html` on the host machine to monitor connections live.

---

## 7. Distributed Systems Explanations

### A. Multithreading Model
Unlike standard single-threaded JS execution, Node's `worker_threads` module executes JavaScript in parallel on separate OS-level threads.
When a client clicks **Watch Live**:
- The main thread handles VTS calculations.
- On successful allocation, the server instantiates a `new Worker('./worker.js')`.
- The worker executes asynchronously in its own OS thread thread pool, checking resource sleep durations and sending `CHUNK` event messages back to the main thread.
- The main thread receives these events and pipes them to the client's Socket.io channel, showing concurrent multithreading log progress.

### B. VTS Source Allocation Algorithm
The VTS determines allocation by evaluating active loads and proximity metrics:
1. **Filtering**: Iterate through the source registry. Discard any node that is toggled **OFFLINE** or is currently at capacity (`connected >= capacity`).
2. **Sorting**: Sort the remaining available nodes by simulated latency (ascending order).
3. **Selection**: Select the lowest latency node (e.g., `Peer-1` at 20ms).
4. **Tie Breaking**: If multiple nodes share the same latency, select the node with the highest remaining capacity.
5. **Failover**: If a node goes offline, the VTS queries the algorithm for active clients, transfers them to the next best node, logs the reallocation switch, and triggers a `SOURCE_CHANGED` socket command to seamlessly update client player streams.

### C. Deadlock Laboratory
The Deadlock simulation demonstrates Dijkstra's circular wait prevention schemes:
- **Circular Wait (Unsafe)**: Thread 1 locks Resource A and waits for Resource B. Thread 2 locks Resource B and waits for Resource A. Both sleep indefinitely. The VTS monitors the locks and detects deadlocks after a 5-second wait.
- **Resource Ordering (Safe)**: Forces both workers to acquire resources in a strict numerical sequence (Lock Peer-1, then lock Edge-1). Worker 2 waits for Peer-1 to free up, preventing overlap.
- **Lock Timeouts (Safe)**: If a worker holds a resource but cannot acquire the next resource within 1.5 seconds, it releases its holds and sleeps, letting the other thread finish.
