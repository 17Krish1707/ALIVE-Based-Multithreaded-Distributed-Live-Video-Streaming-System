import java.io.*;
import java.net.Socket;
import java.util.Scanner;

public class Client {

    private static final String SERVER_ADDRESS =
            "localhost";

    private static final int SERVER_PORT = 6000;

    public static void main(String[] args) {

        Scanner scanner =
                new Scanner(System.in);

        System.out.println();
        System.out.println(
                "================================================");

        System.out.println(
                "          ALIVE LIVE STREAMING CLIENT");

        System.out.println(
                "================================================");

        System.out.println();

        try (
                Socket socket =
                        new Socket(
                                SERVER_ADDRESS,
                                SERVER_PORT);

                BufferedReader input =
                        new BufferedReader(
                                new InputStreamReader(
                                        socket.getInputStream()));

                PrintWriter output =
                        new PrintWriter(
                                socket.getOutputStream(),
                                true)
        ) {

            // --------------------------------------------------
            // Receive welcome message
            // --------------------------------------------------

            String welcome =
                    input.readLine();

            if (welcome != null
                    && welcome.startsWith("WELCOME|")) {

                System.out.println(
                        "Server: "
                                + welcome.substring(8));
            }

            // --------------------------------------------------
            // Enter user name
            // --------------------------------------------------

            System.out.print(
                    "Enter your name: ");

            String name =
                    scanner.nextLine();

            output.println(name);

            // --------------------------------------------------
            // Display available videos
            // --------------------------------------------------

            System.out.println();
            System.out.println(
                    "Available videos:");

            System.out.println(
                    "1. Live Cricket Match");

            System.out.println(
                    "2. Live News");

            System.out.println(
                    "3. Live Concert");

            System.out.println();

            System.out.print(
                    "Enter video choice: ");

            String choice =
                    scanner.nextLine();

            String video;

            switch (choice) {

                case "1":
                    video = "Live Cricket Match";
                    break;

                case "2":
                    video = "Live News";
                    break;

                case "3":
                    video = "Live Concert";
                    break;

                default:
                    video = "Live Cricket Match";
            }

            System.out.println();
            System.out.println(
                    "Requesting: "
                            + video);

            output.println(video);

            // --------------------------------------------------
            // Receive server responses
            // --------------------------------------------------

            boolean streaming = false;

            while (true) {

                String response =
                        input.readLine();

                if (response == null) {
                    break;
                }

                String[] parts =
                        response.split("\\|");

                switch (parts[0]) {

                    case "SOURCE":

                        System.out.println();
                        System.out.println(
                                "------------------------------------------------");

                        System.out.println(
                                "STREAM SOURCE SELECTED");

                        System.out.println(
                                "Source : "
                                        + parts[1]);

                        System.out.println(
                                "Type   : "
                                        + parts[2]);

                        System.out.println(
                                "Latency: "
                                        + parts[3]
                                        + " ms");

                        System.out.println(
                                "------------------------------------------------");

                        break;

                    case "STREAM_START":

                        System.out.println();
                        System.out.println(
                                "Starting live stream...");

                        streaming = true;

                        break;

                    case "CHUNK":

                        if (streaming) {

                            int chunk =
                                    Integer.parseInt(
                                            parts[1]);

                            int total =
                                    Integer.parseInt(
                                            parts[2]);

                            String source =
                                    parts[3];

                            displayChunk(
                                    chunk,
                                    total,
                                    source);
                        }

                        break;

                    case "STREAM_COMPLETE":

                        System.out.println();
                        System.out.println(
                                "================================================");

                        System.out.println(
                                "       LIVE STREAM COMPLETED");

                        System.out.println(
                                "================================================");

                        System.out.println();

                        System.out.println(
                                "Thank you for watching!");

                        return;

                    case "ERROR":

                        System.out.println();
                        System.out.println(
                                "ERROR: "
                                        + parts[1]);

                        return;

                    default:

                        System.out.println(
                                "Server: "
                                        + response);
                }
            }

        } catch (IOException e) {

            System.out.println();
            System.out.println(
                    "Could not connect to server.");

            System.out.println(
                    "Make sure VirtualTrackerServer "
                            + "is running.");

            System.out.println();
            System.out.println(
                    "Error: "
                            + e.getMessage());
        }
    }

    private static void displayChunk(
            int chunk,
            int total,
            String source) {

        int progress =
                (chunk * 30) / total;

        StringBuilder bar =
                new StringBuilder();

        for (int i = 0; i < progress; i++) {
            bar.append("=");
        }

        for (int i = progress; i < 30; i++) {
            bar.append("-");
        }

        System.out.println(
                "[Client] Receiving chunk "
                        + chunk
                        + "/"
                        + total
                        + " from "
                        + source);

        System.out.println(
                "[" + bar + "] "
                        + ((chunk * 100) / total)
                        + "%");
    }
}