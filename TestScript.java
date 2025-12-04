import java.io.FileWriter;
import java.io.PrintWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.CountDownLatch;

public class TestScript {
    // Configuration
    private static final String BASE_URL = "http://localhost:3000/api/users";
    private static final int TARGET_ID = 1; 
    private static final String LOG_FILE = "results.txt"; // Output file
    
    // Global Writer
    private static PrintWriter fileWriter;

    public static void main(String[] args) {
        try {
            fileWriter = new PrintWriter(new FileWriter(LOG_FILE, true));
            log("\n==================================================");
            log("NEW TEST RUN: " + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            log("==================================================");

            String[] isolationLevels = {
                "READ UNCOMMITTED",
                "READ COMMITTED",
                "REPEATABLE READ",
                "SERIALIZABLE"
            };

            for (String level : isolationLevels){
                log("\n--------------------------------------------------");
                log("TESTING ISOLATION LEVEL: " + level);
                log("--------------------------------------------------");

                // Case 1: Concurrent Reads
                concurrentReadTest(level);
                Thread.sleep(2000); 

                // Case 2: Read vs Write
                readWriteTest(level);
                Thread.sleep(2000);

                // Case 3: Concurrent Writes
                concurrentWriteTest(level);
                Thread.sleep(3000); 
            }

        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (fileWriter != null) fileWriter.close();
        }
    }

    // --- LOGGING FUNCTION ---
    // Writes to System.out and the Text File
    private static synchronized void log(String msg) {
        System.out.println(msg);
        if (fileWriter != null) {
            fileWriter.println(msg);
            fileWriter.flush();
        }
    }

    // --- TEST CASES ---

    private static void concurrentReadTest(String isolationLevel) throws InterruptedException {
        log("\n[Case #1] Concurrent Reads (User A & User B)");
        CountDownLatch latch = new CountDownLatch(1);

        Thread userA = new Thread(new RequestTask("User A", "GET", isolationLevel, latch));
        Thread userB = new Thread(new RequestTask("User B", "GET", isolationLevel, latch));

        userA.start();
        userB.start();

        latch.countDown(); 
        userA.join();
        userB.join();
    }   

    private static void readWriteTest(String isolationLevel) throws InterruptedException {
        log("\n[Case #2] Write (User A) vs Read (User B)");
        CountDownLatch latch = new CountDownLatch(1);

        Thread userA = new Thread(new RequestTask("User A [WRITE]", "PUT", "Locked_Region", isolationLevel, latch));
        Thread userB = new Thread(new RequestTask("User B [READ]", "GET", isolationLevel, latch));

        userA.start();
        userB.start();

        latch.countDown(); 
        userA.join();
        userB.join();
        resetData();
    }

    private static void concurrentWriteTest(String isolationLevel) throws InterruptedException {
        log("\n[Case #3] Concurrent Writes (Race Condition)");
        CountDownLatch latch = new CountDownLatch(1);

        Thread userA = new Thread(new RequestTask("User A", "PUT", "Country_A", isolationLevel, latch)); 
        Thread userB = new Thread(new RequestTask("User B", "PUT", "Country_B", isolationLevel, latch));

        userA.start();
        userB.start();
        
        latch.countDown(); 
        userA.join();
        userB.join();

        printFinalState();
    }

    private static void resetData() {
        try {
            performRequest("RESET", "PUT", "Philippines", "READ COMMITTED");
        } catch (Exception e) {}
    }

    private static void printFinalState() {
        try {
            log("   -> Final DB Value: " + performRequest("Check", "GET", null, "READ COMMITTED"));
        } catch (Exception e) {}
    }

    static class RequestTask implements Runnable {
        String user, method, data, isolation;
        CountDownLatch latch;

        public RequestTask(String user, String method, String isolation, CountDownLatch latch) {
            this(user, method, null, isolation, latch);
        }

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
                latch.await(); 
                String response = performRequest(user, method, data, isolation);
                log("   " + user + " Finished: " + response);
            } catch (Exception e) {
                log("   " + user + " Failed: " + e.getMessage());
            }
        }
    }

    private static String performRequest(String user, String method, String data, String isolation) throws Exception {
        String encodedIso = isolation.replace(" ", "%20");
        String url = BASE_URL + "/" + TARGET_ID + "?iso=" + encodedIso;

        HttpClient client = HttpClient.newHttpClient();
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(10));

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

        String body = response.body().length() > 50 ? response.body().substring(0, 50) + "..." : response.body();
        // Return strictly formatted string for log
        return String.format("[%d ms] Status %d | %s", duration, response.statusCode(), body);
    }
}