# Test Scenarios: PulseAI WhatsApp Gateway

This document outlines the testing scenarios to verify the functionality, reliability, and security of the WhatsApp Gateway service before deploying it to production.

## Prerequisites for Testing

1.  **Local Environment:** Ensure Node.js (v20+) is installed.
2.  **Dependencies:** Run `npm install` in the `whatsapp-gateway` directory.
3.  **Environment Variables:** Create a `.env` file based on `.env.example` with a dummy `FASTIFY_WEBHOOK_URL` (e.g., using a service like webhook.site for testing webhook payloads) and `LOG_LEVEL=info` (to see the logs during testing).
4.  **Testing Tool:** Postman, Insomnia, or simple `curl` commands to hit the API endpoints.
5.  **WhatsApp Account:** A secondary WhatsApp account/phone to scan the QR code and test message sending/receiving.

---

## Scenario 1: Multi-Tenant Session Initialization & QR Generation

**Objective:** Verify that the gateway can generate a QR code for a new user and store the session data correctly.

1.  **Action:** Start the server (`npm run dev`).
2.  **Action:** Send a `GET` request to `http://localhost:4000/api/session/start?userId=test_user_1`.
3.  **Expected Result:**
    *   Response is `200 OK`.
    *   JSON response contains `"success": true`, `"status": "qr"`, and `"qrBase64"` with a valid `data:image/png;base64,...` string.
4.  **Action:** Open a browser, paste the Base64 string into the URL bar, and press Enter.
5.  **Expected Result:** The QR code image is displayed correctly.
6.  **Action:** Check the file system in the `whatsapp-gateway` directory.
7.  **Expected Result:** A directory named `sessions/test_user_1` exists and contains Baileys initial state files.

---

## Scenario 2: WhatsApp Web Authentication

**Objective:** Verify that a user can successfully link their WhatsApp account by scanning the QR code.

1.  **Action:** Using a WhatsApp account on a phone, navigate to "Linked Devices" and scan the QR code generated in Scenario 1.
2.  **Expected Result:**
    *   The phone successfully links to the gateway.
    *   The server logs show `[SessionManager] Session connected (OPEN)`.
3.  **Action:** Send a `GET` request to `http://localhost:4000/api/session/status?userId=test_user_1`.
4.  **Expected Result:** Response contains `"status": "open"` and `"qrBase64": null`.

---

## Scenario 3: Session Persistence (VPS Reboot Simulation)

**Objective:** Verify that connected sessions survive a server restart without requiring the user to scan the QR code again.

1.  **Pre-condition:** `test_user_1` is already connected (from Scenario 2).
2.  **Action:** Stop the server (`Ctrl+C` in the terminal).
3.  **Action:** Start the server again (`npm run dev`).
4.  **Expected Result:**
    *   Server logs show `[SessionManager] Restoring existing sessions`.
    *   Server logs show `[SessionManager] Session connected (OPEN)` for `test_user_1` automatically, without needing a new QR code.
5.  **Action:** Send a `GET` request to `http://localhost:4000/api/session/status?userId=test_user_1`.
6.  **Expected Result:** Response confirms the status is `"open"`.

---

## Scenario 4: Receiving Messages & Webhook Trigger

**Objective:** Verify that the gateway correctly captures incoming direct messages, filters out unwanted messages (groups, status, self), and forwards valid messages to the webhook.

1.  **Pre-condition:** Server is running, `test_user_1` is connected, and `.env` has a valid `FASTIFY_WEBHOOK_URL` (e.g., a webhook.site URL).
2.  **Action (Valid Message):** From *another* WhatsApp account, send a text message (e.g., "Hello API") to the phone number linked as `test_user_1`.
3.  **Expected Result:**
    *   Server logs indicate `[SessionManager] Incoming message`.
    *   Check your webhook test URL. You should see a `POST` request containing:
        ```json
        {
          "sender": "628xxxxxxxxxx",
          "message": "Hello API",
          "userId": "test_user_1"
        }
        ```
    *   The headers should include `x-gateway-secret` matching your `.env`.
4.  **Action (Group Message):** Send a message in a WhatsApp group where `test_user_1` is a member.
5.  **Expected Result:** The gateway ignores the message. No webhook is triggered.
6.  **Action (Outgoing Message):** Use the phone acting as `test_user_1` to send a message to someone.
7.  **Expected Result:** The gateway ignores the outgoing message. No webhook is triggered.

---

## Scenario 5: Webhook Retry Mechanism (504 Timeout Simulation)

**Objective:** Verify the exponential backoff retry logic if the Fastify API is down.

1.  **Action:** Change the `FASTIFY_WEBHOOK_URL` in `.env` to a non-existent local port (e.g., `http://localhost:9999/api/webhook`). Restart the server.
2.  **Action:** Send a WhatsApp message to `test_user_1`.
3.  **Expected Result:**
    *   The initial webhook POST fails.
    *   Server logs show warnings: `[Webhook] Attempt failed — will retry` and `[Webhook] Retrying after failure` with increasing delays (e.g., 2s, 4s, 8s).
    *   After 3 retries, it logs an error `[Webhook] FAILED — all retries exhausted` but the **server does NOT crash** and the WhatsApp session remains open.

---

## Scenario 6: Sending Messages via API

**Objective:** Verify that the Fastify API can send messages outwards via the Gateway.

1.  **Pre-condition:** `test_user_1` is connected.
2.  **Action:** Send a `POST` request to `http://localhost:4000/api/session/send` with the body:
    ```json
    {
      "userId": "test_user_1",
      "to": "628123456789", 
      "message": "This is a test message from PulseAI Gateway."
    }
    ```
    *(Replace `to` with a real testing phone number without the `+`)*
3.  **Expected Result:**
    *   Response is `200 OK` with `"success": true`.
    *   The recipient phone number receives the WhatsApp message.

---

## Scenario 7: Session Logout & Cleanup

**Objective:** Verify that logging out correctly terminates the connection and deletes the user's session folder.

1.  **Action:** Send a `DELETE` request to `http://localhost:4000/api/session/logout?userId=test_user_1`.
2.  **Expected Result:**
    *   Response is `200 OK` confirming the logout.
    *   The directory `sessions/test_user_1` is deleted from the file system.
3.  **Action:** Send a `GET` request to `http://localhost:4000/api/session/status?userId=test_user_1`.
4.  **Expected Result:** Response shows `"status": "disconnected"`.

---

## Scenario 8: Graceful Shutdown (SIGTERM)

**Objective:** Ensure the application cleans up resources when stopped by PM2 or system signals.

1.  **Pre-condition:** Server is running and multiple users (e.g., `test_user_1`, `test_user_2`) are connected.
2.  **Action:** Send a `SIGINT` signal to the process (e.g., press `Ctrl+C` in the terminal where it's running).
3.  **Expected Result:**
    *   Server logs show `[Server] Shutdown signal received. Closing resources...`.
    *   Logs show `[SessionManager] Destroying all sessions (graceful shutdown)`.
    *   The process exits cleanly (`process.exit(0)`).
