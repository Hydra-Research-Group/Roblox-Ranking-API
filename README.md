# 🔧 Roblox Ranking API

A Node.js Express API to manage Roblox group ranks via Roblox Cloud APIs. Includes in-memory caching, access/admin key auth, webhook logging, and more.

Created by [Hydra Research Group](https://github.com/orgs/Hydra-Research-Group).

---

## 🚀 Features

- ✅ Update group ranks via official Roblox Cloud API
- 🔐 Key-based Access & Admin authentication
- ⚡ In-memory caching of memberships & roles
- 📈 Winston logging and webhook notifications
- 🛡️ Rate limiting to protect from abuse
- 🔁 Webhook Proxying from Roblox requests (e.g. to Discord or Guilded)
- 🧠 Metrics endpoint for uptime, request count, and cache stats
- 🗒️ Webhook logs for successful rank updates (username, role name, group name)

---

## 📁 Setup

1. Clone the repository:
```bash
git clone https://github.com/Hydra-Research-Group/Roblox-Ranking-API.git
cd Roblox-Ranking-API
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
touch .env
```

And add the following keys:
```env
GROUP_ID=your-roblox-group-id
PORT=3000
ACCESS_API_KEY=your-client-access-key
ADMIN_API_KEY=your-admin-key
API_KEY=your-roblox-cloud-api-key
STATUS_WEBHOOK=https://your.status.webhook.url
RANKING_WEBHOOK=https://your.auto-ranking.webhook.url

# Webhook Proxies (used with /proxy-webhook/:system)
PROXY_WEBHOOK_LOGS=https://example.webhook.url
PROXY_WEBHOOK_RANKUP=https://example.webhook.url
```

4. Start the server:
```bash
npm start
```

---

## 📡 API Endpoints

### `GET /`
Returns a simple confirmation message.

---

### `PATCH /update-rank`
Updates a user's rank and logs to a webhook (if configured).

**Headers:**
- `x-access-key`: Your access key

**Body:**
```json
{
  "userId": "12345678",
  "rank": 50
}
```

**Webhook Log Format:**
```
The rank of **Username** has been changed to **Rank Name**
```

**Responses:**
- `200 OK`: Rank updated successfully
- `400 Bad Request`: That user already has that rank
- `403 Forbidden`: Invalid access key
- `404 Not Found`: Membership or role not found
- `500 Internal Error`: API or internal error

---

### `POST /proxy-webhook/:system`
Relays messages from Roblox to preconfigured webhooks based on the `system`.

**Headers:**
- `x-access-key`: Your access key

**Params:**
- `:system` — the identifier for the webhook (e.g., `logs`, `rankup`)

**Body:**
Payload that you want to forward (same format e.g. Discord or Guilded expects):
```json
{
  "content": "A new user was ranked!",
  "embeds": []
}
```

---

### `GET /metrics`
Returns API uptime, total requests, and cache hit/miss stats.

**Headers:**
- `x-admin-key`: Your admin key

**Response:**
```json
{
  "uptime": "3600 seconds",
  "totalRequests": 1234,
  "cache": {
    "membership": {
      "hits": 100,
      "misses": 20
    },
    "role": {
      "hits": 80,
      "misses": 5
    }
  }
}
```

---

### `POST /clear-cache`
Clears the in-memory cache.

**Headers:**
- `x-admin-key`: Your admin key

**Response:**
```json
{
  "message": "All caches cleared"
}
```

---

## 🧠 Caching Behavior

- Memberships cached for **10 minutes**
- Roles cached for **30 minutes**
- Use `/clear-cache` to manually reset

---

## 📌 Notes

- Make sure your API key has permissions to manage ranks for the group.
- Use a reverse proxy like NGINX or Cloudflare in production for HTTPS.
- Keep access/admin keys secret.