# 🔧 Roblox Ranking API

A small, sturdy Node.js API for managing Roblox group ranks via the official Roblox Cloud APIs, with caching, key-based auth, webhook logging, metrics, and a few quality-of-life tools.

Created by [Hydra Research Group](https://github.com/orgs/Hydra-Research-Group).

---

## ✨ What you get

- ✅ Rank updates via Roblox Cloud API  
- 🔐 Key-based Access and Admin authentication (headers)  
- 🧰 Input validation (Joi)  
- ⚡ In-memory caching (memberships & roles)  
- 🧠 Metrics endpoint (uptime, request count, cache stats)  
- 📈 Logging (winston, timestamped via moment)  
- 🔁 Webhook proxying (e.g. forward Discord/Guilded payloads)  
- 🛡️ Security headers with helmet + `x-powered-by` disabled  
- 🚦 Rate limiting: 40 requests/min/IP (global)  

---

## 🧰 Quickstart

1. **Clone & install**
   ```bash
   git clone https://github.com/Hydra-Research-Group/Roblox-Ranking-API.git
   cd Roblox-Ranking-API
   npm install
   ```

2. **Configure** `.env` (rename from `.env.example` and fill in values)

3. **Run**
   ```bash
   npm start
   ```

---

## ⚙️ Environment variables

| Variable               | Required | Description                                                                                                                  |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GROUP_ID`             | Yes      | Your Roblox group ID.                                                                                                        |
| `API_KEY`              | Yes      | Roblox API key with `groups` access and `group:write` permission. [Docs](https://create.roblox.com/docs/cloud/auth/api-keys) |
| `PORT`                 | No       | Port for the API to run on (default: 3080).                                                                                  |
| `ACCESS_API_KEY`       | Yes      | Header key (`x-access-key`) for `/update-rank` and `/proxy-webhook/:system`.                                                 |
| `ADMIN_API_KEY`        | Yes      | Header key (`x-admin-key`) for `/metrics` and `/clear-cache`.                                                                |
| `DEVELOPER_PING`       | No       | Discord mention (e.g. `<@!12345>`) when API restarts.                                                                        |
| `STATUS_WEBHOOK`       | No       | Webhook notified when API restarts.                                                                                          |
| `RANKING_WEBHOOK`      | No       | Webhook for logging successful rank updates.                                                                                 |
| `PROXY_WEBHOOK_<NAME>` | No       | One or more system webhooks (e.g. `PROXY_WEBHOOK_BAN`) for `/proxy-webhook/:system`.                                         |

---

## 📡 API Endpoints

### `GET /`

**Purpose:** Health check, confirms API is alive.  
**Response:**
```json
{
  "type": "Custom Roblox Ranking API",
  "developer": "HydraXploit",
  "status": "OK"
}
```

---

### `PATCH /update-rank`

**Purpose:** Update a user's group rank.  
**Headers:**  
- `x-access-key`: Access API key  

**Body:**
```json
{
  "userId": 12345678,
  "rank": 50
}
```

- `userId`: positive integer  
- `rank`: integer 1–254  

**Success webhook (if configured):**
```
The rank of **Username** has been changed to **Role Name**
```

**Responses:**  
- `200 OK` → Rank updated  
- `400 Bad Request` → Invalid body, or the user is already in the specified rank  
- `403 Forbidden` → Bad access key  
- `404 Not Found` → Membership/role not found  
- `500 Internal Error` → Roblox API/internal error  

---

### `POST /proxy-webhook/:system`

**Purpose:** Relay payloads to a preconfigured webhook.  
**Headers:**  
- `x-access-key`: Access API key  

**Params:**  
- `:system` → must match an env var (`PROXY_WEBHOOK_<NAME>`)  

**Body (example):**
```json
{
  "content": "A new user was ranked!",
  "embeds": []
}
```

**Responses:**  
- `200 OK` → Message sent  
- `403 Forbidden` → Bad access key  
- `404 Not Found` → Invalid system  
- `500 Internal Error` → Failed to send  

---

### `GET /metrics`

**Purpose:** Returns uptime, total requests, and cache stats.  
**Headers:**  
- `x-admin-key`: Admin API key  

**Response:**
```json
{
  "uptime": "3600 seconds",
  "totalRequests": 1234,
  "cache": {
    "membership": { "hits": 100, "misses": 20 },
    "role": { "hits": 80, "misses": 5 }
  }
}
```

---

### `POST /clear-cache`

**Purpose:** Manually clears membership & role caches.  
**Headers:**  
- `x-admin-key`: Admin API key  

**Response:**
```json
{ "message": "All caches cleared" }
```

---

## 🧠 Caching

- Memberships: 10 minutes  
- Roles: 30 minutes  
- Clear manually: `POST /clear-cache`  

---

## 🔒 Security Notes

- All rank updates are validated (Joi).  
- Roblox API key must have `group:write` permission.  
- Uses helmet and disables `x-powered-by`.  
- Global rate limit: 40 req/min/IP.  
- Protect your `ACCESS_API_KEY` and `ADMIN_API_KEY`.  
- Recommended: run behind HTTPS (e.g., NGINX, Cloudflare).  

---

## 📜 License

Licensed under the [Hydra Research Group Permissive License (HRGPL)](LICENSE).