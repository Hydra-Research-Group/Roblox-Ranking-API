# 🔧 Roblox Ranking API

A small, sturdy Node.js API for managing Roblox group ranks via the official Roblox Cloud APIs, with caching, key-based authentication, webhook logging queues, metrics, and operational tooling.

Created by [Hydra Research Group](https://github.com/orgs/Hydra-Research-Group).

---

# ✨ Features

* ✅ Roblox group rank updates via Roblox Cloud API
* 🔐 Access and Admin API keys for endpoint protection
* 🧰 Request validation using Joi
* ⚡ In-memory caching for memberships and roles
* 📦 Webhook logging queue with controlled delivery
* 📈 Structured logging with winston
* 🧠 Metrics endpoint (uptime, request count, cache stats)
* 🛡️ Security headers via helmet and `x-powered-by` disabled
* 🚦 Global request rate limiting (40 requests/min/IP)

---

# 🧰 Quickstart

### 1. Clone & install

```bash
git clone https://github.com/Hydra-Research-Group/Roblox-Ranking-API.git
cd Roblox-Ranking-API
npm install
```

### 2. Configure environment variables

Rename `.env.example` to `.env` and fill in the required values.

### 3. Start the API

```bash
npm start
```

---

# ⚙️ Environment Variables

| Variable         | Required | Description                                                      |
| ---------------- | -------- | ---------------------------------------------------------------- |
| `GROUP_ID`       | Yes      | Roblox group ID                                                  |
| `API_KEY`        | Yes      | Roblox API key with `groups` access and `group:write` permission |
| `PORT`           | No       | Port for the API server (default: `3080`)                        |
| `ACCESS_API_KEY` | Yes      | Access key used in `x-access-key` header                         |
| `ADMIN_API_KEY`  | Yes      | Admin key used in `x-admin-key` header                           |
| `DEVELOPER_PING` | No       | Discord mention when API restarts                                |
| `STATUS_WEBHOOK` | No       | Webhook notified when API restarts                               |

### Webhook Systems

Webhook destinations are configured via environment variables.

Format:

```
PROXY_WEBHOOK_<SYSTEM>
```

Examples:

```
PROXY_WEBHOOK_RANKING=https://discord.com/api/webhooks/...
PROXY_WEBHOOK_MODERATION=https://discord.com/api/webhooks/...
PROXY_WEBHOOK_DEV_TESTERS=https://discord.com/api/webhooks/...
```

The `<SYSTEM>` name must match the `system` field sent to the logging endpoint.

---

# 📡 API Endpoints

## `GET /`

Health check endpoint used to confirm the API is running.

### Response example

```json
{
  "type": "Custom Roblox Ranking and Logging API",
  "status": "OK"
}
```

---

## `PATCH /update-rank`

Updates a Roblox group member's rank.

### Headers

```
x-access-key: ACCESS_API_KEY
```

### Request body

```json
{
  "userId": 12345678,
  "rank": 50
}
```

| Field    | Description                   |
| -------- | ----------------------------- |
| `userId` | Roblox user ID                |
| `rank`   | Rank number between 1 and 254 |

### Response example

```json
{
  "success": true,
  "userId": 12345678,
  "groupId": 987654,
  "roleId": "1234567890",
  "roleName": "Moderator"
}
```

### Possible responses

| Status | Meaning                      |
| ------ | ---------------------------- |
| `200`  | Rank updated successfully    |
| `400`  | Invalid request body         |
| `403`  | Invalid access key           |
| `404`  | Membership or role not found |
| `500`  | Internal server error        |

---

## `POST /queue-log`

Queues a webhook log message for delivery.

### Headers

```
x-access-key: ACCESS_API_KEY
```

### Request body

```json
{
  "system": "ranking",
  "content": "User promoted"
}
```

or

```json
{
  "system": "moderation",
  "embeds": [
    {
      "title": "Kick",
      "description": "User kicked for exploiting"
    }
  ]
}
```

| Field     | Required | Description           |
| --------- | -------- | --------------------- |
| `system`  | Yes      | Webhook system name   |
| `content` | No       | Text message          |
| `embeds`  | No       | Discord embed objects |

At least one of `content` or `embeds` must be provided.

### Response

```json
{
  "success": true
}
```

---

## `GET /metrics`

Returns runtime metrics and cache statistics.

### Headers

```
x-admin-key: ADMIN_API_KEY
```

### Response example

```json
{
  "uptime": "3600s",
  "totalRequests": 1234,
  "cache": {
    "membershipHits": 100,
    "membershipMisses": 20,
    "roleHits": 80,
    "roleMisses": 5
  }
}
```

---

## `POST /clear-cache`

Clears all in-memory caches.

### Headers

```
x-admin-key: ADMIN_API_KEY
```

### Response example

```json
{
  "message": "All caches cleared"
}
```

---

# 🧠 Caching

Membership and role lookups are cached to reduce requests to Roblox Cloud APIs.

| Cache       | TTL        |
| ----------- | ---------- |
| Memberships | 10 minutes |
| Roles       | 30 minutes |

Caches can be cleared manually using `POST /clear-cache`.

---

# 🔒 Security Notes

* Requests are validated using Joi.
* Roblox API key must include `group:write` permission.
* Access and admin keys are compared using constant-time checks.
* Helmet security headers are enabled.
* `x-powered-by` is disabled.
* Global rate limit: **40 requests/min/IP**.
* Deploy behind HTTPS (recommended: NGINX or Cloudflare).

---

# 📜 License

Licensed under the [Hydra Research Group Permissive License (HRGPL)](./LICENSE).