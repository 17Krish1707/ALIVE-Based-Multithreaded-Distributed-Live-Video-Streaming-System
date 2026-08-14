import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/*
 * Experiment 1:
 * Implementation of Multithreading in Distributed System
 *
 * Case Study:
 * ALIVE Hybrid P2P-CDN Live Video Streaming Architecture
 *
 * This is a simulation for a Distributed Computing laboratory.
 *
 * Architecture:
 *
 *                  Virtual Tracker Server
 *                         /    |    \
 *                        /     |     \
 *                     Peer    Edge    CDN
 *                      |       |      |
 *                      +-------+------+
 *                              |
 *                           Clients
 */

public class ALIVE_Multithreading {

    // ============================================================
    // CONFIGURATION
    // ============================================================

    private static final int NUMBER_OF_CLIENTS = 6;
    private static final int NUMBER_OF_CHUNKS = 5;

    // Used to simulate the time required to transfer a video chunk.
    private static final int CHUNK_PROCESSING_TIME = 300;

    // ============================================================
    // VIDEO REQUEST
    // ============================================================

    static class VideoRequest {

        private final String clientName;
        private final String videoName;

        public VideoRequest(String clientName, String videoName) {
            this.clientName = clientName;
            this.videoName = videoName;
        }

        public String getClientName() {
            return clientName;
        }

        public String getVideoName() {
            return videoName;
        }
    }

    // ============================================================
    // VIDEO SOURCE
    // ============================================================

    static class VideoSource {

        private final String name;
        private final String type;

        private final int latency;
        private final int totalBandwidth;

        private int usedBandwidth = 0;

        public VideoSource(
                String name,
                String type,
                int latency,
                int totalBandwidth) {

            this.name = name;
            this.type = type;
            this.latency = latency;
            this.totalBandwidth = totalBandwidth;
        }

        public String getName() {
            return name;
        }

        public String getType() {
            return type;
        }

        public int getLatency() {
            return latency;
        }

        public int getAvailableBandwidth() {
            return totalBandwidth - usedBandwidth;
        }

        /*
         * synchronized ensures that two client threads cannot
         * modify the bandwidth value at exactly the same time.
         */
        public synchronized boolean allocateBandwidth(int amount) {

            if (usedBandwidth + amount <= totalBandwidth) {

                usedBandwidth += amount;

                return true;
            }

            return false;
        }

        /*
         * Releases bandwidth after the client finishes.
         */
        public synchronized void releaseBandwidth(int amount) {

            usedBandwidth -= amount;

            if (usedBandwidth < 0) {
                usedBandwidth = 0;
            }
        }

        public synchronized int getUsedBandwidth() {
            return usedBandwidth;
        }
    }

    // ============================================================
    // VIRTUAL TRACKER SERVER
    // ============================================================

    static class VirtualTrackerServer {

        private final List<VideoSource> sources;

        public VirtualTrackerServer(List<VideoSource> sources) {
            this.sources = sources;
        }

        /*
         * The VTS selects a source using:
         *
         * 1. Available bandwidth
         * 2. Latency
         *
         * Lower latency is preferred, but the source must
         * have enough available bandwidth.
         */
        public synchronized VideoSource selectSource(VideoRequest request) {

            VideoSource selected = null;

            for (VideoSource source : sources) {

                // Each client requires 20 units of bandwidth.
                if (source.getAvailableBandwidth() >= 20) {

                    if (selected == null) {

                        selected = source;

                    } else {

                        /*
                         * Prefer lower latency.
                         */
                        if (source.getLatency() < selected.getLatency()) {

                            selected = source;

                        } else if (
                                source.getLatency() == selected.getLatency()
                                &&
                                source.getAvailableBandwidth()
                                >
                                selected.getAvailableBandwidth()) {

                            selected = source;
                        }
                    }
                }
            }

            return selected;
        }

        public void displaySources() {

            System.out.println();
            System.out.println("------------------------------------------------------------");
            System.out.println("AVAILABLE DISTRIBUTED VIDEO SOURCES");
            System.out.println("------------------------------------------------------------");

            System.out.printf(
                    "%-15s %-10s %-12s %-15s%n",
                    "Source",
                    "Type",
                    "Latency",
                    "Bandwidth");

            System.out.println("------------------------------------------------------------");

            for (VideoSource source : sources) {

                System.out.printf(
                        "%-15s %-10s %-12s %-15s%n",
                        source.getName(),
                        source.getType(),
                        source.getLatency() + " ms",
                        source.getAvailableBandwidth()
                                + " units");
            }

            System.out.println("------------------------------------------------------------");
        }
    }

    // ============================================================
    // CLIENT THREAD
    // ============================================================

    static class ClientThread extends Thread {

        private final VideoRequest request;
        private final VirtualTrackerServer tracker;

        private VideoSource selectedSource;

        public ClientThread(
                VideoRequest request,
                VirtualTrackerServer tracker) {

            super(request.getClientName());

            this.request = request;
            this.tracker = tracker;
        }

        @Override
        public void run() {

            long startTime = System.currentTimeMillis();

            System.out.println(
                    "["
                            + getName()
                            + "] REQUEST SENT -> "
                            + request.getVideoName());

            // ----------------------------------------------------
            // Ask Virtual Tracker Server for a suitable source
            // ----------------------------------------------------

            selectedSource = tracker.selectSource(request);

            if (selectedSource == null) {

                System.out.println(
                        "["
                                + getName()
                                + "] NO SOURCE AVAILABLE");

                return;
            }

            // ----------------------------------------------------
            // Allocate bandwidth
            // ----------------------------------------------------

            boolean allocated =
                    selectedSource.allocateBandwidth(20);

            if (!allocated) {

                System.out.println(
                        "["
                                + getName()
                                + "] BANDWIDTH ALLOCATION FAILED");

                return;
            }

            System.out.println(
                    "["
                            + getName()
                            + "] VTS SELECTED -> "
                            + selectedSource.getName()
                            + " ("
                            + selectedSource.getType()
                            + ", "
                            + selectedSource.getLatency()
                            + " ms)");

            System.out.println(
                    "["
                            + getName()
                            + "] STARTING VIDEO STREAM");

            // ----------------------------------------------------
            // Simulate receiving video chunks
            // ----------------------------------------------------

            for (int chunk = 1;
                 chunk <= NUMBER_OF_CHUNKS;
                 chunk++) {

                try {

                    Thread.sleep(
                            CHUNK_PROCESSING_TIME
                            +
                            ThreadLocalRandom.current()
                                    .nextInt(50, 151));

                } catch (InterruptedException e) {

                    Thread.currentThread().interrupt();

                    System.out.println(
                            "["
                                    + getName()
                                    + "] THREAD INTERRUPTED");

                    break;
                }

                System.out.println(
                        "["
                                + getName()
                                + "] RECEIVED VIDEO CHUNK "
                                + chunk
                                + "/"
                                + NUMBER_OF_CHUNKS
                                + " FROM "
                                + selectedSource.getName());
            }

            // ----------------------------------------------------
            // Release bandwidth
            // ----------------------------------------------------

            selectedSource.releaseBandwidth(20);

            long endTime = System.currentTimeMillis();

            System.out.println(
                    "["
                            + getName()
                            + "] STREAM COMPLETED"
                            + " | Time = "
                            + (endTime - startTime)
                            + " ms");

            System.out.println(
                    "["
                            + getName()
                            + "] CONNECTION CLOSED");
        }
    }

    // ============================================================
    // SEQUENTIAL EXECUTION
    // ============================================================

    /*
     * This method is used only for comparison.
     *
     * Requests are processed one after another.
     */
    public static long runSequentialDemo(
            VirtualTrackerServer tracker) {

        System.out.println();
        System.out.println("============================================================");
        System.out.println("SEQUENTIAL EXECUTION");
        System.out.println("============================================================");

        long startTime = System.currentTimeMillis();

        for (int i = 1; i <= NUMBER_OF_CLIENTS; i++) {

            String clientName = "Sequential-User-" + i;

            VideoRequest request =
                    new VideoRequest(
                            clientName,
                            "Live Cricket Match");

            ClientThread client =
                    new ClientThread(
                            request,
                            tracker);

            /*
             * Directly calling run() does NOT create a new thread.
             *
             * Therefore requests execute one by one.
             */
            client.run();
        }

        long endTime = System.currentTimeMillis();

        return endTime - startTime;
    }

    // ============================================================
    // MULTITHREADED EXECUTION
    // ============================================================

    public static long runMultithreadedDemo(
            VirtualTrackerServer tracker) {

        System.out.println();
        System.out.println("============================================================");
        System.out.println("MULTITHREADED EXECUTION");
        System.out.println("============================================================");

        long startTime = System.currentTimeMillis();

        ClientThread[] clients =
                new ClientThread[NUMBER_OF_CLIENTS];

        // --------------------------------------------------------
        // Create threads
        // --------------------------------------------------------

        for (int i = 0; i < NUMBER_OF_CLIENTS; i++) {

            String clientName =
                    "User-" + (i + 1);

            VideoRequest request =
                    new VideoRequest(
                            clientName,
                            "Live Cricket Match");

            clients[i] =
                    new ClientThread(
                            request,
                            tracker);
        }

        // --------------------------------------------------------
        // Start all threads
        // --------------------------------------------------------

        System.out.println();
        System.out.println("Starting "
                + NUMBER_OF_CLIENTS
                + " client threads...");

        for (ClientThread client : clients) {

            client.start();
        }

        // --------------------------------------------------------
        // Wait for all threads
        // --------------------------------------------------------

        for (ClientThread client : clients) {

            try {

                client.join();

            } catch (InterruptedException e) {

                Thread.currentThread().interrupt();

                System.out.println(
                        "Main thread interrupted.");
            }
        }

        long endTime = System.currentTimeMillis();

        return endTime - startTime;
    }

    // ============================================================
    // MAIN METHOD
    // ============================================================

    public static void main(String[] args) {

        System.out.println();
        System.out.println("============================================================");
        System.out.println(" EXPERIMENT 1: MULTITHREADING IN DISTRIBUTED SYSTEM");
        System.out.println("============================================================");

        System.out.println();
        System.out.println("Case Study:");
        System.out.println(
                "ALIVE Hybrid P2P-CDN Live Video Streaming Architecture");

        System.out.println();
        System.out.println("Architecture:");
        System.out.println(
                "Clients -> Virtual Tracker Server -> Peer / Edge / CDN");

        // --------------------------------------------------------
        // Create distributed video sources
        // --------------------------------------------------------

        VideoSource peer1 =
                new VideoSource(
                        "Peer-1",
                        "P2P",
                        20,
                        60);

        VideoSource peer2 =
                new VideoSource(
                        "Peer-2",
                        "P2P",
                        30,
                        50);

        VideoSource edge1 =
                new VideoSource(
                        "Edge-1",
                        "EDGE",
                        50,
                        100);

        VideoSource cdn1 =
                new VideoSource(
                        "CDN-1",
                        "CDN",
                        100,
                        150);

        List<VideoSource> sources =
                Arrays.asList(
                        peer1,
                        peer2,
                        edge1,
                        cdn1);

        // --------------------------------------------------------
        // Create Virtual Tracker Server
        // --------------------------------------------------------

        VirtualTrackerServer tracker =
                new VirtualTrackerServer(sources);

        // --------------------------------------------------------
        // Display architecture resources
        // --------------------------------------------------------

        tracker.displaySources();

        // --------------------------------------------------------
        // Sequential execution
        // --------------------------------------------------------

        long sequentialTime =
                runSequentialDemo(tracker);

        // --------------------------------------------------------
        // Multithreaded execution
        // --------------------------------------------------------

        long multithreadedTime =
                runMultithreadedDemo(tracker);

        // --------------------------------------------------------
        // Results
        // --------------------------------------------------------

        System.out.println();
        System.out.println("============================================================");
        System.out.println("EXPERIMENT RESULTS");
        System.out.println("============================================================");

        System.out.println(
                "Sequential Execution Time   : "
                        + sequentialTime
                        + " ms");

        System.out.println(
                "Multithreaded Execution Time: "
                        + multithreadedTime
                        + " ms");

        if (sequentialTime > 0) {

            double improvement =
                    ((double)
                            (sequentialTime - multithreadedTime)
                            /
                            sequentialTime)
                            * 100.0;

            System.out.printf(
                    "Time Improvement             : %.2f%%%n",
                    improvement);
        }

        System.out.println();
        System.out.println("============================================================");
        System.out.println("CONCLUSION");
        System.out.println("============================================================");

        System.out.println(
                "Multiple client requests were processed concurrently");

        System.out.println(
                "using independent Java threads.");

        System.out.println(
                "The Virtual Tracker Server selected suitable");
        
        System.out.println(
                "distributed video sources for the clients.");

        System.out.println(
                "Shared bandwidth was protected using synchronization.");

        System.out.println(
                "Multithreading demonstrates concurrent request");
        
        System.out.println(
                "processing in the ALIVE-based distributed streaming model.");

        System.out.println("============================================================");
    }
}