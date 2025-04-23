const express = require("express");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
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
require("dotenv").config();

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 40
});

let totalRequests = 0;
let apiStartTime = Date.now();

let metrics = {
    membershipHits: 0,
    membershipMisses: 0,
    roleHits: 0,
    roleMisses: 0
};

const app = express();
app.use(express.json());
app.use(limiter);
app.disable("x-powered-by");

app.use((req, res, next) => {
    totalRequests++;
    next();
});

const PORT = process.env.PORT || 3000;
const GROUP_ID = process.env.GROUP_ID;

async function sendWithRetry(url, payload, maxAttempts = 10, delayMs = 2500) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await axios.post(url, payload);

            logger.info(`Ranking log sent successfully on attempt ${attempt}`);

            return;
        } catch (error) {
            logger.warn(`Attempt ${attempt} failed to send ranking log: ${error.message}`);

            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                logger.error(`All attempts to send ranking log failed. Log content: ${payload.content}`);
            };
        };
    };
};

async function fetchUsername(userId) {
    const url = `https://users.roblox.com/v1/users/${userId}`;
    const res = await axios.get(url);

    return res.data.name;
};

app.get("/", (_, res) => {
    res.json({
        status: "OK",
        developer: "HydraXploit"
    });
});

app.patch("/update-rank", accessKeyAuth, async (req, res) => {
    const { userId, rank } = req.body;

    if (!userId || !rank) {
        logger.warn(`Invalid request received: userId: ${userId}, rank: ${rank}`);

        return res.status(400).json({
            error: "Invalid request"
        });
    };

    try {
        let membershipId = getMembership(userId);

        if (membershipId) {
            metrics.membershipHits++;
        } else {
            metrics.membershipMisses++;

            const membership = await fetchMembership(GROUP_ID, userId);

            if (membership) {
                membershipId = saveMembership(membership.user.split("/")[1], membership.path.split("/")[3]);
            } else {
                logger.error(`Failed to fetch membership for userId: ${userId}`);
            };
        };

        if (!membershipId) {
            logger.warn(`Membership not found for userId: ${userId}`);

            return res.status(404).json({
                error: "Membership not found"
            });
        };

        let role = getRoleByRank(rank);
        let roleId;

        if (role) {
            metrics.roleHits++;

            roleId = role.id;
        } else {
            metrics.roleMisses++;

            role = await fetchRoleByRank(GROUP_ID, rank);

            if (role) {
                role = saveRoleByRank(role.rank, role);
                roleId = role.id;
            } else {
                logger.error(`Failed to fetch role for rank: ${rank}`);
            };
        };

        if (!roleId) {
            logger.warn(`Role not found for rank: ${rank}`);

            return res.status(404).json({
                error: "Role not found"
            });
        };

        const response = await updateRank(GROUP_ID, membershipId, userId, roleId);

        res.json(response);

        try {
            if (process.env.RANKING_WEBHOOK) {
                const [username] = await Promise.all([
                    fetchUsername(userId)
                ]);

                const roleDisplay = role ? role.displayName : rank;

                await sendWithRetry(process.env.RANKING_WEBHOOK, {
                    content: `The rank of **${username}** has been changed to **${roleDisplay}**`
                });
            };
        } catch (error) {
            logger.error(`Unexpected error while preparing ranking log: ${error.message}`);
        };
    } catch (error) {
        logger.error(`Error updating rank for userId: ${userId} - ${error.message}`);

        res.status(500).json({
            error: error.message
        });
    };
});

app.post("/proxy-webhook/:system", accessKeyAuth, proxyValidator, async (req, res) => {
    try {
        const { webhookUrl } = req;

        await axios.post(webhookUrl, req.body);

        res.json({
            message: "Message proxied successfully"
        });
    } catch (error) {
        logger.error(`Error proxying request: ${error.message}`);

        res.status(500).json({
            error: "Failed to proxy request"
        });
    };
});

app.get("/metrics", adminKeyAuth, (_, res) => {
    const uptimeSeconds = Math.floor((Date.now() - apiStartTime) / 1000);

    res.json({
        uptime: `${uptimeSeconds} seconds`,
        totalRequests,
        cache: {
            membership: {
                hits: metrics.membershipHits,
                misses: metrics.membershipMisses
            },
            role: {
                hits: metrics.roleHits,
                misses: metrics.roleMisses
            }
        }
    });
});

app.post("/clear-cache", adminKeyAuth, async (_, res) => {
    clearAllCaches();

    res.json({
        message: "All caches cleared"
    });
});

const SendStartupLog = async () => {
    try {
        await axios.post(process.env.STATUS_WEBHOOK, {
            content: "**[STARTED]** The API is now active."
        });
    } catch (error) {
        logger.error(`Error sending startup log to webhook: ${error.message}`);
    };
};

SendStartupLog();

app.listen(PORT, () => logger.info(`API is running on port ${PORT}`));