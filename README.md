# 🔧 Roblox Ranking API

A Node.js Express API to manage Roblox group ranks via Roblox Cloud APIs. Includes in-memory caching, access/admin key auth, logging, and rate limiting.

Created by [Hydra Research Group](https://github.com/orgs/Hydra-Research-Group).

---

## 🚀 Features

- ✅ Update group ranks via official Roblox Cloud API
- 🔐 Key-based Access & Admin authentication
- ⚡ In-memory caching of memberships & roles
- 📈 Winston logging and webhook notifications
- 🛡️ Rate limiting to protect from abuse

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
PORT=3000
ACCESS_API_KEY=your-client-access-key
ADMIN_API_KEY=your-admin-key
API_KEY=your-roblox-cloud-api-key
GUILDED_WEBHOOK=https://your.webhook.url
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

### `PATCH /update-rank/:groupId`
Updates a user's rank in a specified group.

**Headers:**
- `x-access-key`: Your access key

**Body:**
```json
{
  "userId": "12345678",
  "rank": 50
}
```

**Responses:**
- `200 OK`: Rank updated successfully
- `403 Forbidden`: Invalid access key
- `404 Not Found`: Membership or role not found
- `500 Internal Error`: API or internal error

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
- Use a reverse proxy like NGINX or Cloudflare in production for HTTPS and caching.
- Keep access/admin keys secret.

---

## 🛡️ License

Licensed under ISC by Hydra Research Group.