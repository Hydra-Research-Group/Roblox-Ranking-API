const express = require("express");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const Joi = require("joi");
const {
    fetchMembership,
    fetchRoleByRank,
    fetchAllRoles,
    resolveUser,
    assignRole,
    unassignRole
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
const { enqueueLog, workerLoop, queues, getCooldownUntil } = require("./queue");

require("dotenv").config({ quiet: true });

const app = express();

app.set("trust proxy", 1);

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

/* -------------------- Routes -------------------- */

app.get("/", (_, res) => {
    res.json({
        type: "Custom Roblox Ranking and Webhook Proxy API",
        status: "OK"
    });
});

app.patch("/update-rank", accessKeyAuth, async (req, res) => {
    const schema = Joi.object({
        groupId: Joi.number().integer().positive().required(),
        userId: Joi.number().integer().positive().required(),
        addRank: Joi.number().integer().min(1).max(254).optional(),
        removeRank: Joi.number().integer().min(1).max(254).optional()
    }).or("addRank", "removeRank");

    const { error, value } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const { groupId, userId, addRank, removeRank } = value;

    let membershipId = getMembership(groupId, userId);

    if (membershipId) {
        metrics.membershipHits++;
    } else {
        metrics.membershipMisses++;

        let membership;
        try {
            membership = await fetchMembership(groupId, userId);
        } catch (err) {
            logger.error(`Failed to fetch membership for userId=${userId}: ${err.message}`);
            return res.status(500).json({ error: "Failed to fetch membership" });
        }

        if (!membership) {
            return res.status(404).json({ error: "Membership not found" });
        }

        membershipId = membership.path.split("/").pop();
        saveMembership(groupId, userId, membershipId);
    }

    let addRole = null;
    let removeRole = null;

    if (addRank !== undefined) {
        addRole = getRoleByRank(groupId, addRank);

        if (addRole) {
            metrics.roleHits++;
        } else {
            metrics.roleMisses++;
            try {
                addRole = await fetchRoleByRank(groupId, addRank);
            } catch (err) {
                logger.error(`Failed to fetch role for addRank=${addRank}: ${err.message}`);
            }

            if (addRole) {
                saveRoleByRank(groupId, addRank, addRole);
            }
        }
    }

    if (removeRank !== undefined) {
        removeRole = getRoleByRank(groupId, removeRank);

        if (removeRole) {
            metrics.roleHits++;
        } else {
            metrics.roleMisses++;
            try {
                removeRole = await fetchRoleByRank(groupId, removeRank);
            } catch (err) {
                logger.error(`Failed to fetch role for removeRank=${removeRank}: ${err.message}`);
            }

            if (removeRole) {
                saveRoleByRank(groupId, removeRank, removeRole);
            }
        }
    }

    const result = {};

    if (addRank !== undefined) {
        if (!addRole) {
            result.assign = {
                success: false,
                error: "Role not found for addRank"
            };
        } else {
            try {
                await assignRole(groupId, membershipId, addRole.id);
                result.assign = {
                    success: true,
                    roleId: addRole.id,
                    roleName: addRole.displayName
                };
            } catch (err) {
                const detail = err.response?.data ?? err.message;
                logger.error(`assignRole failed | userId=${userId} roleId=${addRole.id}\n${JSON.stringify(detail, null, 2)}`);
                result.assign = {
                    success: false,
                    error: "Roblox API error during assign"
                };
            }
        }
    }

    if (removeRank !== undefined) {
        if (!removeRole) {
            result.unassign = {
                success: false,
                error: "Role not found for removeRank"
            };
        } else {
            try {
                await unassignRole(groupId, membershipId, removeRole.id);
                result.unassign = {
                    success: true,
                    roleId: removeRole.id,
                    roleName: removeRole.displayName
                };
            } catch (err) {
                const detail = err.response?.data ?? err.message;
                logger.error(`unassignRole failed | userId=${userId} roleId=${removeRole.id}\n${JSON.stringify(detail, null, 2)}`);
                result.unassign = {
                    success: false,
                    error: "Roblox API error during unassign"
                };
            }
        }
    }

    const ops = Object.values(result);
    const successCount = ops.filter(op => op.success).length;
    const overallSuccess = (successCount === ops.length);

    const statusCode = (overallSuccess ? 200 : ((successCount > 0) ? 207 : 500));

    logger.info(`Rank update complete | groupId=${groupId} userId=${userId} status=${statusCode} assign=${JSON.stringify(result.assign ?? null)} unassign=${JSON.stringify(result.unassign ?? null)}`);

    return res.status(statusCode).json({
        success: overallSuccess,
        userId,
        groupId,
        ...result
    });
});

app.get("/groups/:groupId/roles", accessKeyAuth, async (req, res) => {
    const groupId = Number(req.params.groupId);

    if (!Number.isInteger(groupId) || groupId <= 0) {
        return res.status(400).json({ error: "groupId must be a positive integer" });
    }

    try {
        const roles = await fetchAllRoles(groupId);
        return res.json({ success: true, groupId, roles });
    } catch (err) {
        logger.error(`fetchAllRoles failed | groupId=${groupId}: ${err.message}`);

        if (err.response?.status === 403) {
            return res.status(403).json({ error: "API key does not have access to this group" });
        }
        if (err.response?.status === 404) {
            return res.status(404).json({ error: "Group not found" });
        }

        return res.status(500).json({ error: "Failed to fetch roles" });
    }
});

app.get("/users/resolve", accessKeyAuth, async (req, res) => {
    const schema = Joi.object({
        username: Joi.string().min(3).max(20).required()
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    try {
        const user = await resolveUser(value.username);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        return res.json({ success: true, ...user });
    } catch (err) {
        logger.error(`resolveUser failed | username=${value.username}: ${err.message}`);
        return res.status(500).json({ error: "Failed to resolve user" });
    }
});

app.post("/queue-log", accessKeyAuth, async (req, res) => {
    const schema = Joi.object({
        system: Joi.string().required(),
        content: Joi.string().optional(),
        embeds: Joi.array().optional()
    }).or("content", "embeds");

    const { error, value } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({
            error: error.details[0].message
        });
    }

    const { system, content, embeds } = value;

    enqueueLog(system.toLowerCase(), {
        content,
        embeds
    });

    res.json({
        success: true
    });
});

app.get("/queue-inspect", adminKeyAuth, (_, res) => {
    const snapshot = {};

    for (const [system, logs] of Object.entries(queues)) {
        snapshot[system] = {
            count: logs.length,
            logs: logs.map(log => ({
                ...(log.content !== undefined && { content: log.content }),
                ...(log.embeds !== undefined && { embeds: log.embeds })
            }))
        };
    }

    const cooldownUntil = getCooldownUntil();
    const now = Date.now();

    res.json({
        totalSystems: Object.keys(snapshot).length,
        cooldownActive: now < cooldownUntil,
        cooldownRemainingMs: (now < cooldownUntil) ? (cooldownUntil - now) : 0,
        systems: snapshot
    });
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

    workerLoop();

    await sendStartupLog();
});

const shutdown = () => {
    logger.info("Shutting down...");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);