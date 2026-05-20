# PulseAI — Unofficial WhatsApp Gateway Service

A production-ready, standalone, multi-tenant WhatsApp Gateway service built using Express.js and the `@whiskeysockets/baileys` library. It exposes endpoints to programmatically authenticate users via QR codes (Base64) and webhook messages (incoming/outgoing) back to your primary Fastify API.

Designed to run persistently on a VPS (Ubuntu) using PM2, with robust handling of system reboots and automatic back-off retries for webhook targets.

---

## Features

1. **Robust Multi-Tenant Isolation**: Store connection state keys dynamically in separated directories under `/sessions/[userId]` using `useMultiFileAuthState`.
2. **Persistent Sessions**: Restarting the Node.js server does **not** log out connected accounts. The gateway auto-restores active sessions on boot.
3. **API-Powered QR Codes**: `/api/session/start?userId=XXXX` returns the Baileys pairing QR code as a Base64 Image string (`data:image/png;base64,...`) for the frontend to render.
4. **Reliable Webhook Forwarder**: Filter out outgoing/bot messages, status updates, and group chats. Forwards valid direct messages to your Fastify API endpoint with built-in retry handlers for `504` and connection timeouts.
5. **VPS Production-Ready**: Uses `pino` silenced/restricted log limits to prevent bloating disk storage, is secured using `helmet` & `express-rate-limit`, and gracefully closes sockets on `SIGTERM` / `SIGINT`.

---

## Directory Structure

```
whatsapp-gateway/
├── src/
│   ├── config/
│   │   └── index.js            # Configuration validator (dotenv)
│   ├── routes/
│   │   └── sessionRoutes.js    # Express endpoints (Start, Status, Send, Logout)
│   ├── session/
│   │   └── sessionManager.js   # Baileys Socket creation, Event listeners, QR parsing
│   ├── utils/
│   │   ├── logger.js           # Pino configuration
│   │   └── webhookClient.js    # Axios Client with Exponential Retry
│   └── server.js               # Main entry point (App configuration, system signals)
├── sessions/                   # Dynamic runtime folder containing user states
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Installation & Setup

### 1. Install Dependencies
```bash
cd whatsapp-gateway
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your details:
```env
PORT=4000
NODE_ENV=production
GATEWAY_SECRET=my_custom_secure_secret
FASTIFY_WEBHOOK_URL=http://localhost:3001/api/whatsapp/incoming
SESSIONS_DIR=./sessions
LOG_LEVEL=error
```

---

## Run Locally

```bash
# Run in development mode (with watcher)
npm run dev

# Run in production mode
npm start
```

---

## API Documentation

### 1. Initialize a Session / Fetch QR Code
* **Endpoint**: `GET /api/session/start?userId={userId}`
* **Description**: Returns the QR code base64 if pairing is required, or notifies you if the user is already authenticated.
* **Response (Needs Pairing)**:
  ```json
  {
    "success": true,
    "userId": "user_12345",
    "status": "qr",
    "qrBase64": "data:image/png;base64,iVBORw0KGgoAAA..."
  }
  ```
* **Response (Already Connected)**:
  ```json
  {
    "success": true,
    "userId": "user_12345",
    "status": "open",
    "qrBase64": null
  }
  ```

### 2. Check Session Status
* **Endpoint**: `GET /api/session/status?userId={userId}`
* **Response**:
  ```json
  {
    "success": true,
    "userId": "user_12345",
    "status": "open",
    "qrBase64": null
  }
  ```

### 3. Send Message
* **Endpoint**: `POST /api/session/send`
* **Body**:
  ```json
  {
    "userId": "user_12345",
    "to": "6287826563459",
    "message": "Hello from PulseAI Bot!"
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "message": "Message sent successfully."
  }
  ```

### 4. Logout / Delete Session
* **Endpoint**: `DELETE /api/session/logout?userId={userId}`
* **Description**: Logs out from WhatsApp, closes sockets, and removes credentials from the VPS filesystem.

---

## VPS Deployment Guide (Ubuntu + PM2)

### 1. Install Node.js & PM2
On your Ubuntu Server:
```bash
# Install Node (v20+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -pm2 -g
```

### 2. Move files and Run with PM2
Upload the `whatsapp-gateway` code directory to your VPS (e.g., `/var/www/pulseai-whatsapp-gateway`).

Create the PM2 execution ecosystem configuration (`ecosystem.config.cjs`):
```javascript
module.exports = {
  apps: [{
    name: 'pulseai-whatsapp-gateway',
    script: './src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    }
  }]
};
```

Run with PM2:
```bash
pm2 start ecosystem.config.cjs

# Make PM2 restart on VPS system reboots
pm2 startup
pm2 save
```

### 3. Configure Nginx Reverse Proxy (Optional, HTTPS support)
Add an Nginx config server block (`/etc/nginx/sites-available/whatsapp-gateway`):
```nginx
server {
    server_name wagateway.pulseai.biz.id;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Enable the configuration and add Let's Encrypt SSL:
```bash
sudo ln -s /etc/nginx/sites-available/whatsapp-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo certbot --nginx -d wagateway.pulseai.biz.id
```
---

## State Guard & Webhook Delivery Logic

Incoming messages are filtered using:
```javascript
// Skip group messages
if (isJidGroup(remoteJid)) continue;
// Skip status messages
if (isJidBroadcast(remoteJid)) continue;
// Skip own messages
if (msg.key.fromMe) continue;
```
Valid payloads are HTTP POSTed to your `FASTIFY_WEBHOOK_URL`:
```json
{
  "sender": "6287826563459",
  "message": "Actual message content string",
  "userId": "user_12345"
}
```
The gateway is resilient to Fastify API cold boots/timeouts, utilizing a retry scheduler featuring exponential backoff.
