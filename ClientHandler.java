import java.io.*;
import java.net.Socket;
import java.util.List;

public class ClientHandler extends Thread {

    private final Socket socket;
    private final List<VideoSource> sources;

    private BufferedReader input;
    private PrintWriter output;

    private VideoSource selectedSource;

    private static final int BANDWIDTH_REQUIRED = 20;

    private static final int NUMBER_OF_CHUNKS = 5;

    public ClientHandler(
            Socket socket,
            List<VideoSource> sources) {

        this.socket = socket;
        this.sources = sources;
    }

    @Override
    public void run() {

        String threadName =
                Thread.currentThread().getName();

        System.out.println(
                "[" + threadName + "] Handler started.");

        try {

            input =
                    new BufferedReader(
                            new InputStreamReader(
                                    socket.getInputStream()));

            output =
                    new PrintWriter(
                            socket.getOutputStream(),
                            true);

            /*
             * Send welcome message to client.
             */
            output.println(
                    "WELCOME|Connected to ALIVE Virtual Tracker Server");

            // --------------------------------------------------
            // Receive client name
            // --------------------------------------------------

            String clientName =
                    input.readLine();

            if (clientName == null) {
                closeConnection();
                return;
            }

            System.out.println(
                    "[" + threadName + "] Client: "
                            + clientName);

            // --------------------------------------------------
            // Receive video request
            // --------------------------------------------------

            String request =
                    input.readLine();

            if (request == null) {
                closeConnection();
                return;
            }

            System.out.println(
                    "[" + threadName
                            + "] Video request: "
                            + request);

            // --------------------------------------------------
            // Select video source
            // --------------------------------------------------

            selectedSource =
                    selectBestSource();

            if (selectedSource == null) {

                output.println(
                        "ERROR|No video source available");

                System.out.println(
                        "[" + threadName
                                + "] No source available.");

                closeConnection();

                return;
            }

            // --------------------------------------------------
            // Allocate bandwidth
            // --------------------------------------------------

            boolean allocated =
                    selectedSource.allocateBandwidth(
                            BANDWIDTH_REQUIRED);

            if (!allocated) {

                output.println(
                        "ERROR|Bandwidth unavailable");

                closeConnection();

                return;
            }

            System.out.println(
                    "[" + threadName
                            + "] Selected source: "
                            + selectedSource.getName());

            System.out.println(
                    "[" + threadName
                            + "] Source type: "
                            + selectedSource.getType());

            System.out.println(
                    "[" + threadName
                            + "] Latency: "
                            + selectedSource.getLatency()
                            + " ms");

            // --------------------------------------------------
            // Inform client
            // --------------------------------------------------

            output.println(
                    "SOURCE|"
                            + selectedSource.getName()
                            + "|"
                            + selectedSource.getType()
                            + "|"
                            + selectedSource.getLatency());

            output.println(
                    "STREAM_START");

            System.out.println(
                    "[" + threadName
                            + "] Streaming started.");

            // --------------------------------------------------
            // Send video chunks
            // --------------------------------------------------

            for (int i = 1;
                 i <= NUMBER_OF_CHUNKS;
                 i++) {

                Thread.sleep(700);

                output.println(
                        "CHUNK|"
                                + i
                                + "|"
                                + NUMBER_OF_CHUNKS
                                + "|"
                                + selectedSource.getName());

                System.out.println(
                        "[" + threadName
                                + "] Sent chunk "
                                + i
                                + "/"
                                + NUMBER_OF_CHUNKS
                                + " to client.");
            }

            // --------------------------------------------------
            // Streaming completed
            // --------------------------------------------------

            output.println(
                    "STREAM_COMPLETE");

            System.out.println(
                    "[" + threadName
                            + "] Stream completed.");

            // --------------------------------------------------
            // Release bandwidth
            // --------------------------------------------------

            selectedSource.releaseBandwidth(
                    BANDWIDTH_REQUIRED);

            System.out.println(
                    "[" + threadName
                            + "] Bandwidth released.");

        } catch (IOException e) {

            System.out.println(
                    "[" + threadName
                            + "] Connection error: "
                            + e.getMessage());

        } catch (InterruptedException e) {

            Thread.currentThread().interrupt();

            System.out.println(
                    "[" + threadName
                            + "] Thread interrupted.");

        } finally {

            closeConnection();
        }
    }

    /*
     * Select source using:
     *
     * 1. Enough available bandwidth
     * 2. Lowest latency
     */
    private synchronized VideoSource selectBestSource() {

        VideoSource best = null;

        for (VideoSource source : sources) {

            if (source.getAvailableBandwidth()
                    >= BANDWIDTH_REQUIRED) {

                if (best == null) {

                    best = source;

                } else if (
                        source.getLatency()
                                < best.getLatency()) {

                    best = source;
                }
            }
        }

        return best;
    }

    private void closeConnection() {

        try {

            if (socket != null
                    && !socket.isClosed()) {

                socket.close();
            }

        } catch (IOException e) {

            System.out.println(
                    "Error closing connection.");
        }
    }
}