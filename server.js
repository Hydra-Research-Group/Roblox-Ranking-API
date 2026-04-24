const express = require("express");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const Joi = require("joi");
const {
    fetchMembership,
    fetchMemberRank,
    fetchRoleByRank,
    fetchAllRoles,
    resolveUser,
    assignRole,
    unassignRole,
    acceptJoinRequest,
} = require("./roblox-api");
const {
    getMembership,
    saveMembership,
    deleteMembership,
    clearAllCaches,
} = require("./cache");
const logger = require("./logger");
const { accessKeyAuth, adminKeyAuth } = require("./middleware/keyAuth");
const { enqueueLog, workerLoop, queues, getCooldownUntil } = require("./queue");

require("dotenv").config({ quiet: true });

const app = express();

app.set("trust proxy", 1);

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 40,
});

app.use(express.json());
app.use(helmet());
app.use(limiter);
app.disable("x-powered-by");

let totalRequests = 0;
const apiStartTime = Date.now();

app.use((req, res, next) => {
    totalRequests++;
    logger.info(`${req.method} ${req.originalUrl}`);
    next();
});

const PORT = process.env.PORT || 3080;

async function resolveMembershipId(groupId, userId) {
    const cached = getMembership(groupId, userId);

    if (cached) {
        return cached;
    }

    const membership = await fetchMembership(groupId, userId);

    if (!membership) return null;

    const membershipId = membership.path.split("/").pop();
    saveMembership(groupId, userId, membershipId);
    return membershipId;
}

app.get("/", (_, res) => {
    res.json({
        type: "Custom Roblox Ranking and Webhook Proxy API",
        status: "OK",
    });
});

app.patch("/update-rank", accessKeyAuth, async (req, res) => {
    const schema = Joi.object({
        groupId: Joi.number().integer().positive().required(),
        userId: Joi.number().integer().positive().required(),
        addRank: Joi.number().integer().min(1).max(254).optional(),
        removeRank: Joi.number().integer().min(1).max(254).optional(),
    }).or("addRank", "removeRank");

    const { error, value } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const { groupId, userId, addRank, removeRank } = value;

    let membershipId;
    try {
        membershipId = await resolveMembershipId(groupId, userId);
    } catch (err) {
        logger.error(`Failed to fetch membership for userId=${userId}: ${err.message}`);
        return res.status(500).json({ error: "Failed to fetch membership" });
    }

    if (!membershipId) {
        return res.status(404).json({ error: "Membership not found" });
    }

    let addRole = null;
    let removeRole = null;

    if (addRank !== undefined) {
        try {
            addRole = await fetchRoleByRank(groupId, addRank);
        } catch (err) {
            logger.error(`Failed to fetch role for addRank=${addRank}: ${err.message}`);
        }
    }

    if (removeRank !== undefined) {
        try {
            removeRole = await fetchRoleByRank(groupId, removeRank);
        } catch (err) {
            logger.error(`Failed to fetch role for removeRank=${removeRank}: ${err.message}`);
        }
    }

    async function attemptRoleOp(op, role) {
        const opFn = op === "assign" ? assignRole : unassignRole;

        try {
            await opFn(groupId, membershipId, role.id);
            return { success: true, roleId: role.id, roleName: role.displayName };
        } catch (err) {
            if (err.response?.status === 404) {
                logger.warn(`${op} got 404 for membershipId=${membershipId} — busting cache and retrying`);
                deleteMembership(groupId, userId);

                let freshMembershipId;
                try {
                    const freshMembership = await fetchMembership(groupId, userId);
                    if (!freshMembership) {
                        return { success: false, error: "User is no longer a member of this group" };
                    }
                    freshMembershipId = freshMembership.path.split("/").pop();
                    saveMembership(groupId, userId, freshMembershipId);
                } catch (fetchErr) {
                    logger.error(`Re-fetch membership failed after 404 | userId=${userId}: ${fetchErr.message}`);
                    return { success: false, error: "Failed to re-fetch membership after stale cache" };
                }

                try {
                    await opFn(groupId, freshMembershipId, role.id);
                    return { success: true, roleId: role.id, roleName: role.displayName };
                } catch (retryErr) {
                    const detail = retryErr.response?.data ?? retryErr.message;
                    logger.error(`${op} retry failed | userId=${userId} roleId=${role.id}\n${JSON.stringify(detail, null, 2)}`);
                    return { success: false, error: `Roblox API error during ${op} (retry)` };
                }
            }

            const detail = err.response?.data ?? err.message;
            logger.error(`${op} failed | userId=${userId} roleId=${role.id}\n${JSON.stringify(detail, null, 2)}`);
            return { success: false, error: `Roblox API error during ${op}` };
        }
    }

    const result = {};

    if (addRank !== undefined) {
        result.assign = addRole
            ? await attemptRoleOp("assign", addRole)
            : { success: false, error: "Role not found for addRank" };
    }

    if (removeRank !== undefined) {
        result.unassign = removeRole
            ? await attemptRoleOp("unassign", removeRole)
            : { success: false, error: "Role not found for removeRank" };
    }

    const ops = Object.values(result);
    const successCount = ops.filter(op => op.success).length;
    const overallSuccess = successCount === ops.length;
    const statusCode = overallSuccess ? 200 : (successCount > 0 ? 207 : 500);

    logger.info(`Rank update complete | groupId=${groupId} userId=${userId} status=${statusCode} assign=${JSON.stringify(result.assign ?? null)} unassign=${JSON.stringify(result.unassign ?? null)}`);

    return res.status(statusCode).json({
        success: overallSuccess,
        userId,
        groupId,
        ...result,
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
        username: Joi.string().min(3).max(20).required(),
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

app.get("/groups/:groupId/members/:userId/rank", accessKeyAuth, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const userId = Number(req.params.userId);

    if (!Number.isInteger(groupId) || groupId <= 0) {
        return res.status(400).json({ error: "groupId must be a positive integer" });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: "userId must be a positive integer" });
    }

    try {
        const rank = await fetchMemberRank(groupId, userId);

        if (rank === null) {
            return res.status(404).json({ error: "User is not a member of this group" });
        }

        return res.json({ success: true, groupId, userId, rank: rank.rank, roleId: rank.roleId });
    } catch (err) {
        logger.error(`fetchMemberRank failed | groupId=${groupId} userId=${userId}: ${err.message}`);
        return res.status(500).json({ error: "Failed to fetch member rank" });
    }
});

app.post("/groups/:groupId/join-requests/:userId/accept", accessKeyAuth, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const userId = Number(req.params.userId);

    if (!Number.isInteger(groupId) || groupId <= 0) {
        return res.status(400).json({ error: "groupId must be a positive integer" });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: "userId must be a positive integer" });
    }

    try {
        await acceptJoinRequest(groupId, userId);
        return res.json({ success: true, groupId, userId });
    } catch (err) {
        logger.error(`acceptJoinRequest failed | groupId=${groupId} userId=${userId}: ${err.message}`);

        const status = err.status ?? err.response?.status;
        if (status === 404) {
            return res.status(404).json({ error: "Join request not found for this user" });
        }
        if (status === 403) {
            return res.status(403).json({ error: "Bot does not have permission to manage join requests in this group" });
        }

        return res.status(500).json({ error: "Failed to accept join request" });
    }
});

app.post("/queue-log", accessKeyAuth, async (req, res) => {
    const schema = Joi.object({
        system: Joi.string().required(),
        content: Joi.string().optional(),
        embeds: Joi.array().optional(),
    }).or("content", "embeds");

    const { error, value } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    enqueueLog(value.system.toLowerCase(), {
        content: value.content,
        embeds: value.embeds,
    });

    return res.json({ success: true });
});

app.get("/queue-inspect", adminKeyAuth, (_, res) => {
    const snapshot = {};

    for (const [system, logs] of Object.entries(queues)) {
        snapshot[system] = {
            count: logs.length,
            logs: logs.map(log => ({
                ...(log.content !== undefined && { content: log.content }),
                ...(log.embeds !== undefined && { embeds: log.embeds }),
            })),
        };
    }

    const cooldownUntil = getCooldownUntil();
    const now = Date.now();

    return res.json({
        totalSystems: Object.keys(snapshot).length,
        cooldownActive: now < cooldownUntil,
        cooldownRemainingMs: now < cooldownUntil ? cooldownUntil - now : 0,
        systems: snapshot,
    });
});

app.get("/metrics", adminKeyAuth, (_, res) => {
    const uptimeSeconds = Math.floor((Date.now() - apiStartTime) / 1000);

    return res.json({
        uptime: `${uptimeSeconds}s`,
        totalRequests,
    });
});

app.post("/clear-cache", adminKeyAuth, (_, res) => {
    clearAllCaches();
    return res.json({ message: "All caches cleared" });
});

const sendStartupLog = async () => {
    if (!process.env.STATUS_WEBHOOK) return;

    const payload = {
        embeds: [
            {
                title: "「 API STATUS 」",
                description: "The API has been successfully restarted.",
                color: 5763719,
                footer: { text: "© Hydra Research & Development" },
                timestamp: new Date().toISOString(),
            },
        ],
    };

    if (process.env.DEVELOPER_PING) {
        payload.content = process.env.DEVELOPER_PING;
    }

    try {
        await axios.post(process.env.STATUS_WEBHOOK, payload, { timeout: 5000 });
    } catch (err) {
        logger.error(`Error sending startup log: ${err.message}`);
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