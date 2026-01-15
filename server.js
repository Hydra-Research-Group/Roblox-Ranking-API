const express = require("express");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const Joi = require("joi");
const {
    fetchMembership,
    fetchRoleByRank,
    updateRank
} = require("./roblox-api");
const {
    getMembership,
    saveMembership,
    getRoleByRank,
    saveRoleByRank,
    clearAllCaches
} = require("./cache");
const logger = require("./logger");
const {
    accessKeyAuth,
    adminKeyAuth
} = require("./middleware/keyAuth");
const { proxyValidator } = require("./middleware/proxyValidator");

require("dotenv").config({ quiet: true });

const app = express();

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 40
});

app.use(express.json());
app.use(helmet());
app.use(limiter);
app.disable("x-powered-by");

let totalRequests = 0;
let apiStartTime = Date.now();

let metrics = {
    membershipHits: 0,
    membershipMisses: 0,
    roleHits: 0,
    roleMisses: 0
};

app.use((req, res, next) => {
    totalRequests++;
    logger.info(`${req.method} ${req.originalUrl}`);
    next();
});

const PORT = process.env.PORT || 3080;
const GROUP_ID = process.env.GROUP_ID;

/* -------------------- Helpers -------------------- */

async function sendWithRetry(url, payload, maxAttempts = 10, delayMs = 2500) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await axios.post(url, payload, { timeout: 5000 });
            logger.info(`Ranking log sent on attempt ${attempt}`);
            return;
        } catch (err) {
            logger.warn(`Attempt ${attempt} failed: ${err.message}`);
            if (attempt < maxAttempts) {
                const jitter = Math.floor(Math.random() * 500);
                await new Promise(r => setTimeout(r, delayMs + jitter));
            }
        }
    }

    logger.error(`All attempts failed to send ranking log`);
}

async function fetchUsername(userId) {
    try {
        const res = await axios.get(
            `https://users.roblox.com/v1/users/${userId}`,
            { timeout: 5000 }
        );
        return res.data.name;
    } catch (err) {
        logger.warn(`Failed to fetch username for ${userId}`);
        return `UserId ${userId}`;
    }
}

/* -------------------- Routes -------------------- */

app.get("/", (_, res) => {
    res.json({
        type: "Custom Roblox Ranking and Webhook Proxy API",
        status: "OK"
    });
});

app.patch("/update-rank", accessKeyAuth, async (req, res) => {
    const schema = Joi.object({
        userId: Joi.number().integer().positive().required(),
        rank: Joi.number().integer().min(1).max(254).required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const { userId, rank } = value;

    try {
        let membershipId = getMembership(GROUP_ID, userId);

        if (membershipId) {
            metrics.membershipHits++;
        } else {
            metrics.membershipMisses++;
            const membership = await fetchMembership(GROUP_ID, userId);

            if (!membership) {
                return res.status(404).json({ error: "Membership not found" });
            }

            const parsedUserId = membership.user.replace("users/", "");
            const parsedMembershipId = membership.path.split("/").pop();

            membershipId = saveMembership(GROUP_ID, parsedUserId, parsedMembershipId);
        }

        let role = getRoleByRank(GROUP_ID, rank);
        let roleId;

        if (role) {
            metrics.roleHits++;
            roleId = role.id;
        } else {
            metrics.roleMisses++;
            role = await fetchRoleByRank(GROUP_ID, rank);

            if (!role) {
                return res.status(404).json({ error: "Role not found" });
            }

            saveRoleByRank(GROUP_ID, rank, role);
            roleId = role.id;
        }

        await updateRank(GROUP_ID, membershipId, userId, roleId);

        res.json({
            success: true,
            userId,
            groupId: GROUP_ID,
            roleId,
            roleName: role.displayName
        });

        if (process.env.RANKING_WEBHOOK) {
            const username = await fetchUsername(userId);
            await sendWithRetry(process.env.RANKING_WEBHOOK, {
                content: `The rank of **${username}** has been changed to **${role.displayName}**`
            });
        }
    } catch (err) {
        logger.error(`Rank update failed: ${err.message}`);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/proxy-webhook/:system", accessKeyAuth, proxyValidator, async (req, res) => {
    try {
        await axios.post(req.webhookUrl, req.body, { timeout: 5000 });
        res.json({ message: "Message proxied successfully" });
    } catch (err) {
        logger.error(`Proxy failed: ${err.message}`);
        res.status(500).json({ error: "Failed to proxy request" });
    }
});

app.get("/metrics", adminKeyAuth, (_, res) => {
    const uptimeSeconds = Math.floor((Date.now() - apiStartTime) / 1000);

    res.json({
        uptime: `${uptimeSeconds}s`,
        totalRequests,
        cache: metrics
    });
});

app.post("/clear-cache", adminKeyAuth, (_, res) => {
    clearAllCaches();
    res.json({ message: "All caches cleared" });
});

/* -------------------- Startup / Shutdown -------------------- */

const sendStartupLog = async () => {
    if (!process.env.STATUS_WEBHOOK) return;

    const payload = {
        embeds: [
            {
                title: "「 API STATUS 」",
                description: "The API has been successfully restarted.",
                color: 5763719,
                footer: {
                    text: "© Hydra Research & Development"
                },
                timestamp: new Date().toISOString()
            }
        ]
    };

    if (process.env.DEVELOPER_PING) {
        payload.content = process.env.DEVELOPER_PING;
    }

    try {
        await axios.post(process.env.STATUS_WEBHOOK, payload, { timeout: 5000 });
    } catch (error) {
        logger.error(`Error sending startup log: ${error.message}`);
    }
};

const server = app.listen(PORT, async () => {
    logger.info(`API running on port ${PORT}`);
    await sendStartupLog();
});

const shutdown = () => {
    logger.info("Shutting down...");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);