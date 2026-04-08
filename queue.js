const axios = require("axios");
const logger = require("./logger");

const EMBED_BATCH_SIZE = 10;
const WEBHOOK_MESSAGE_DELAY = 5000;
const SYSTEM_DELAY = 8000;
const MAIN_LOOP_DELAY = 30000;

const queues = {};
const invalidSystems = new Set();

let globalCooldownUntil = 0;
const MAX_QUEUE = 100;

/**
 * @param {String} system
 */
function getWebhook(system) {
    return process.env[`PROXY_WEBHOOK_${system.toUpperCase()}`];
}

/**
 * @param {String} system
 */
function enqueueLog(system, log) {
    if (!queues[system]) {
        queues[system] = [];
    }

    if (queues[system].length > MAX_QUEUE) {
        queues[system].shift();
        logger.warn(`Queue overflow for ${system}, dropping oldest log`);
    }

    queues[system].push(log);
}

/**
 * @param {String} url
 */
async function sendWebhook(url, payload) {
    try {
        await axios.post(url, payload, { timeout: 5000 });
        return { success: true };
    } catch (err) {
        if (err.response) {
            const status = err.response.status;
            const body = err.response.data;

            if (status === 429) {
                const retryAfter =
                    Number(err.response.headers["retry-after"]) ||
                    Number(err.response.data?.retry_after) ||
                    5;

                return {
                    success: false,
                    rateLimit: true,
                    retryAfter
                };
            }

            logger.error(`Discord webhook error ${status}
Discord response: ${JSON.stringify(body)}
Payload sent: ${JSON.stringify(payload)}`);
        } else {
            logger.error(`Discord network error: ${err.message}`);
        }

        return { success: false };
    }
}

/**
 * @param {String} system
 */
async function processSystem(system) {
    const webhook = getWebhook(system);
    if (!webhook) {
        logger.warn(`No webhook configured for system: ${system}`);

        invalidSystems.add(system);
        delete queues[system];

        return;
    }

    const queue = queues[system];
    if (!queue || queue.length === 0) return;

    const embedBuffer = [];
    const contentBuffer = [];
    const failedLogs = [];

    let processed = 0;

    while (queue.length > 0) {
        const log = queue.shift();

        if (log.content) {
            contentBuffer.push(log.content);
        }

        if (Array.isArray(log.embeds)) {
            for (const embed of log.embeds) {
                if (!embed) continue;
                if (!embed.title && !embed.description) {
                    logger.warn(`Dropped an embed for system ${system}, as it missed a title and/or description`);
                    continue;
                };

                embedBuffer.push(embed);
            }
        }

        processed++;
    }

    if (contentBuffer.length > 0) {
        const lines = contentBuffer;
        const batches = [];
        let current = "";

        for (const line of lines) {
            const next = current ? `${current}\n${line}` : line;

            if (next.length > 2000) {
                if (current) batches.push(current);

                current = line.length > 2000 ? `${line.slice(0, 1990)}...` : line;
            } else {
                current = next;
            }
        }

        if (current) batches.push(current);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const result = await sendWebhook(webhook, { content: batch });

            if (result.rateLimit) {
                globalCooldownUntil = Date.now() + (result.retryAfter + 5) * 1000;
                logger.warn(`Discord global rate limit triggered. Cooling down for ${result.retryAfter}s`);

                const remainingBatches = batches.slice(i);
                queues[system].unshift(...remainingBatches.map(b => ({ content: b })));
                return false;
            }

            if (!result.success) {
                failedLogs.push({ content: batch });
            }

            if (i < batches.length - 1) {
                await new Promise(r => setTimeout(r, WEBHOOK_MESSAGE_DELAY));
            }
        }
    }

    if (contentBuffer.length > 0 && embedBuffer.length > 0) {
        await new Promise(r => setTimeout(r, WEBHOOK_MESSAGE_DELAY));
    }

    if (embedBuffer.length > 0) {
        for (let i = 0; i < embedBuffer.length; i += EMBED_BATCH_SIZE) {
            const batch = embedBuffer.slice(i, i + EMBED_BATCH_SIZE);
            const result = await sendWebhook(webhook, { embeds: batch });

            if (result.rateLimit) {
                globalCooldownUntil = Date.now() + (result.retryAfter + 5) * 1000;
                logger.warn(`Discord global rate limit triggered. Cooling down for ${result.retryAfter}s`);

                queues[system].unshift({
                    embeds: batch
                });

                return false;
            }

            if (!result.success) {
                failedLogs.push({
                    embeds: batch
                });
            }

            if (i + EMBED_BATCH_SIZE < embedBuffer.length) {
                await new Promise(r => setTimeout(r, WEBHOOK_MESSAGE_DELAY));
            }
        }
    }

    if (failedLogs.length > 0) {
        queues[system].push(...failedLogs);
    }

    logger.info(`System ${system}: processed=${processed}, failed=${failedLogs.length}, embeds=${embedBuffer.length}, contentLines=${contentBuffer.length}`);

    return true;
}

async function workerLoop() {
    while (true) {
        try {
            const now = Date.now();

            if (now < globalCooldownUntil) {
                const wait = globalCooldownUntil - now;

                logger.warn(`Global webhook cooldown active (${Math.ceil(wait / 1000)}s)`);

                await new Promise(r => setTimeout(r, wait));
                continue;
            }

            const systems = Object.keys(queues);

            for (const system of systems) {
                if (invalidSystems.has(system)) continue;

                const queue = queues[system];
                if (!queue || queue.length === 0) continue;

                const result = await processSystem(system);
                if (result === false) break;

                await new Promise(r => setTimeout(r, SYSTEM_DELAY));
            }

            await new Promise(r => setTimeout(r, MAIN_LOOP_DELAY));
        } catch (err) {
            logger.error(`Unexpected worker error: ${err.message}`);
            await new Promise(r => setTimeout(r, MAIN_LOOP_DELAY));
        }
    }
}

function getCooldownUntil() {
    return globalCooldownUntil;
}

module.exports = {
    enqueueLog,
    workerLoop,
    queues,
    getCooldownUntil
};