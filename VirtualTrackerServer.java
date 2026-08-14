import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;

public class VirtualTrackerServer {

    private static final int PORT = 6000;

    private static final List<VideoSource> sources =
            new ArrayList<>();

    public static void main(String[] args) {

        createVideoSources();

        System.out.println();
        System.out.println("================================================");
        System.out.println("        ALIVE VIRTUAL TRACKER SERVER");
        System.out.println("================================================");

        System.out.println();
        System.out.println("Server starting...");
        System.out.println("Port: " + PORT);

        displaySources();

        try (ServerSocket serverSocket =
                     new ServerSocket(PORT)) {

            System.out.println();
            System.out.println("Server started successfully.");
            System.out.println("Waiting for clients...");
            System.out.println();

            while (true) {

                /*
                 * Wait for a client.
                 */
                Socket clientSocket =
                        serverSocket.accept();

                System.out.println(
                        "[SERVER] New client connected: "
                                + clientSocket.getInetAddress());

                /*
                 * Create a separate thread for this client.
                 */
                ClientHandler clientHandler =
                        new ClientHandler(
                                clientSocket,
                                sources);

                clientHandler.start();
            }

        } catch (IOException e) {

            System.out.println(
                    "[SERVER] Error: "
                            + e.getMessage());
        }
    }

    private static void createVideoSources() {

        sources.add(
                new VideoSource(
                        "Peer-1",
                        "P2P",
                        20,
                        60));

        sources.add(
                new VideoSource(
                        "Peer-2",
                        "P2P",
                        30,
                        50));

        sources.add(
                new VideoSource(
                        "Edge-1",
                        "EDGE",
                        50,
                        100));

        sources.add(
                new VideoSource(
                        "CDN-1",
                        "CDN",
                        100,
                        150));
    }

    private static void displaySources() {

        System.out.println();
        System.out.println(
                "Available distributed video sources:");

        System.out.println(
                "------------------------------------------------");

        System.out.printf(
                "%-12s %-10s %-12s %-15s%n",
                "Source",
                "Type",
                "Latency",
                "Bandwidth");

        System.out.println(
                "------------------------------------------------");

        for (VideoSource source : sources) {

            System.out.printf(
                    "%-12s %-10s %-12s %-15s%n",
                    source.getName(),
                    source.getType(),
                    source.getLatency() + " ms",
                    source.getAvailableBandwidth()
                            + " units");
        }

        System.out.println(
                "------------------------------------------------");
    }
}