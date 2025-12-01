import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;

public class TestScript {
    // Configuration
    private static final String BASE_URL = "http://localhost:3000/api/users";
    private static final int TARGET_ID = 1; // Ensure this user exists in your DB first!

    public static void main(String[] args) {
        try {
            // We test 4 isolation levels
            String[] isolationLevels = {
                "READ UNCOMMITTED",
                "READ COMMITTED",
                "REPEATABLE READ",
                "SERIALIZABLE"
            };

            System.out.println("=== STARTING CONCURRENCY TESTS ===\n");

            for (String level : isolationLevels){
                System.out.println("--------------------------------------------------");
                System.out.println("TESTING ISOLATION LEVEL: " + level);
                System.out.println("--------------------------------------------------");

                // Case 1: Concurrent Reads (Shared Locks)
                concurrentReadTest(level);
                Thread.sleep(2000); // Cool down

                // Case 2: Read vs Write (Dirty Read Check)
                readWriteTest(level);
                Thread.sleep(2000);

                // Case 3: Write vs Write (Exclusive Lock Check)
                concurrentWriteTest(level);
                Thread.sleep(3000); // Allow DB to settle
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // --- CASE 1: CONCURRENT READS ---
    // Both users should be able to read simultaneously without blocking (unless Serializable).
    private static void concurrentReadTest(String isolationLevel) throws InterruptedException {
        System.out.println("\n[Case #1] Concurrent Reads (User A & User B)");
        CountDownLatch latch = new CountDownLatch(1);

        Thread userA = new Thread(new RequestTask("User A", "GET", isolationLevel, latch));
        Thread userB = new Thread(new RequestTask("User B", "GET", isolationLevel, latch));

        userA.start();
        userB.start();

        latch.countDown(); // FIRE!
        
        userA.join();
        userB.join();
    }   

    // --- CASE 2: WRITE vs READ ---
    // User A updates data. User B tries to read.
    // READ UNCOMMITTED: User B sees the new value immediately (Dirty Read).
    // READ COMMITTED: User B sees the OLD value or waits.
    private static void readWriteTest(String isolationLevel) throws InterruptedException {
        System.out.println("\n[Case #2] Write (User A) vs Read (User B)");
        CountDownLatch latch = new CountDownLatch(1);

        // User A updates Country to "Locked"
        Thread userA = new Thread(new RequestTask("User A [WRITE]", "PUT", "Locked_Region", isolationLevel, latch));
        
        // User B tries to read it
        Thread userB = new Thread(new RequestTask("User B [READ]", "GET", isolationLevel, latch));

        userA.start();
        userB.start();

        latch.countDown(); 

        userA.join();
        userB.join();
        
        // Reset data for next test
        resetData();
    }

    // --- CASE 3: CONCURRENT WRITES ---
    // Both users try to update the same row. One MUST wait (Locking).
    private static void concurrentWriteTest(String isolationLevel) throws InterruptedException {
        System.out.println("\n[Case #3] Concurrent Writes (Race Condition)");
        CountDownLatch latch = new CountDownLatch(1);

        Thread userA = new Thread(new RequestTask("User A", "PUT", "Country_A", isolationLevel, latch)); 
        Thread userB = new Thread(new RequestTask("User B", "PUT", "Country_B", isolationLevel, latch));

        userA.start();
        userB.start();
        
        latch.countDown(); 

        userA.join();
        userB.join();

        // Check who won
        printFinalState();
    }

    // --- HELPERS ---

    private static void resetData() {
        try {
            performRequest("RESET", "PUT", "Philippines", "READ COMMITTED");
        } catch (Exception e) {}
    }

    private static void printFinalState() {
        try {
            System.out.println("   -> Final DB Value: " + performRequest("Check", "GET", null, "READ COMMITTED"));
        } catch (Exception e) {}
    }

    // Generic Request Task
    static class RequestTask implements Runnable {
        String user;
        String method; // GET or PUT
        String data;   // Only for PUT
        String isolation;
        CountDownLatch latch;

        // Constructor for READ
        public RequestTask(String user, String method, String isolation, CountDownLatch latch) {
            this(user, method, null, isolation, latch);
        }

        // Constructor for WRITE
        public RequestTask(String user, String method, String data, String isolation, CountDownLatch latch) {
            this.user = user;
            this.method = method;
            this.data = data;
            this.isolation = isolation;
            this.latch = latch;
        }

        @Override
        public void run() {
            try {
                latch.await(); // Wait for the "GO" signal
                String response = performRequest(user, method, data, isolation);
                System.out.println("   " + user + " Finished: " + response);
            } catch (Exception e) {
                System.out.println("   " + user + " Failed: " + e.getMessage());
            }
        }
    }

    private static String performRequest(String user, String method, String data, String isolation) throws Exception {
        String encodedIso = isolation.replace(" ", "%20");
        String url = BASE_URL + "/" + TARGET_ID + "?iso=" + encodedIso;

        HttpClient client = HttpClient.newHttpClient();
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(10)); // Fail if locked too long

        if (method.equals("PUT")) {
            String json = String.format("{\"country\":\"%s\"}", data);
            builder.header("Content-Type", "application/json");
            builder.PUT(BodyPublishers.ofString(json));
        } else {
            builder.GET();
        }

        long start = System.currentTimeMillis();
        HttpResponse<String> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        long end = System.currentTimeMillis();
        long duration = end - start;

        // Extract relevant part of response for cleaner logs
        String body = response.body().length() > 50 ? response.body().substring(0, 50) + "..." : response.body();
        return String.format("[%d ms] Status %d | %s", duration, response.statusCode(), body);
    }
}