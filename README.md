# 🔧 Roblox Ranking API

A Node.js Express API to manage Roblox group ranks via Roblox Cloud APIs. Includes in-memory caching, access/admin key auth, webhook logging, input validation, and more.

Created by [Hydra Research Group](https://github.com/orgs/Hydra-Research-Group).

---

## 🚀 Features

- ✅ Update group ranks via official Roblox Cloud API
- 🔐 Key-based Access & Admin authentication
- 🧰 Input validation with Joi
- ⚡ In-memory caching of memberships & roles
- 🧠 Metrics endpoint for uptime, request count, and cache stats
- 📈 Winston logging and webhook notifications
- 🔁 Webhook Proxying from Roblox requests (e.g. to Discord or Guilded)
- 🛡️ Secure HTTP headers via `helmet`
- 🗒️ Webhook logs for successful rank updates (includes username & role)

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

3. Configure the `.env` file.<br>Rename the [.env.example](./.env.example) file, and fill out the details that it needs

4. Start the server:
```bash
npm start
```

---

## 📡 API Endpoints

### `GET /`
Returns a simple confirmation message to verify that the API is running.

---

### `PATCH /update-rank`
Updates a user's rank and logs the result to a webhook (if configured).

**Headers:**
- `x-access-key`: Your access key

**Body:**
```json
{
  "userId": 12345678,
  "rank": 50
}
```

- `userId`: Must be a positive integer
- `rank`: Must be an integer from 1 to 254

**Webhook Log Format:**
```
The rank of **Username** has been changed to **Rank Name**
```

**Responses:**
- `200 OK`: Rank updated successfully
- `400 Bad Request`: Invalid input (e.g. missing or malformed `userId` or `rank`)
- `403 Forbidden`: Invalid access key
- `404 Not Found`: Membership or role not found
- `500 Internal Error`: API or internal error

---

### `POST /proxy-webhook/:system`
Relays messages to a preconfigured webhook based on the `system` path parameter.

**Headers:**
- `x-access-key`: Your access key

**Params:**
- `:system` — Identifier for the webhook (e.g., `logs`, `rankup`)

**Body:**
Payload you want to forward:
```json
{
  "content": "A new user was ranked!",
  "embeds": []
}
```

**Response:**
- `200 OK`: Webhook message sent
- `403 Forbidden`: Invalid access key
- `404 Not Found`: Invalid system
- `500 Internal Error`: Failed to send message

---

### `GET /metrics`
Returns API uptime, request count, and in-memory cache stats.

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
Clears both membership and role caches.

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

- Memberships are cached for **10 minutes**
- Roles are cached for **30 minutes**
- Use `/clear-cache` to manually reset cache

---

## 🔒 Notes

- Input to `/update-rank` is validated using `Joi`
- The `helmet` middleware is used to enhance HTTP header security
- The username is fetched and included in webhook messages on successful rank updates
- Ensure your Roblox API key has permission to manage ranks for the group
- Consider using a reverse proxy (like NGINX or Cloudflare) for HTTPS and additional security
- Keep your `ACCESS_API_KEY` and `ADMIN_API_KEY` private