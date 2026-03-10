const axios = require("axios");
const logger = require("./logger");

const EMBED_BATCH_SIZE = 10;
const SYSTEM_DELAY = 5000;
const MAIN_LOOP_DELAY = 20000;

const queues = {};

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
        let content = contentBuffer.join("\n");

        if (content.length > 2000) {
            content = `${content.slice(0, 1990)}...`;
        }

        const result = await sendWebhook(webhook, { content });

        if (result.rateLimit) {
            globalCooldownUntil = Date.now() + (result.retryAfter + 5) * 1000;

            logger.warn(`Discord global rate limit triggered. Cooling down for ${result.retryAfter}s`);

            queues[system].unshift({ content });

            return false;
        }

        if (!result.success) {
            failedLogs.push({ content });
        }
    }

    for (let i = 0; i < embedBuffer.length; i += EMBED_BATCH_SIZE) {
        const batch = embedBuffer.slice(i, i + EMBED_BATCH_SIZE);

        const result = await sendWebhook(webhook, {
            embeds: batch
        });

        if (result.rateLimit) {
            globalCooldownUntil = Date.now() + result.retryAfter * 1000;

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
    }

    if (failedLogs.length > 0) {
        queues[system].push(...failedLogs);
    }

    logger.info(`System ${system}: processed=${processed}, failed=${failedLogs.length}, embeds=${embedBuffer.length}, contentLines=${contentBuffer.length}`);

    return true;
}

async function workerLoop() {
    while (true) {
        const now = Date.now();

        if (now < globalCooldownUntil) {
            const wait = globalCooldownUntil - now + 5000;

            logger.warn(`Global webhook cooldown active (${Math.ceil(wait / 1000)}s)`);

            await new Promise(r => setTimeout(r, wait));
            continue;
        }

        const systems = Object.keys(queues);

        for (const system of systems) {
            const result = await processSystem(system);
            if (result === false) break;

            await new Promise(r => setTimeout(r, SYSTEM_DELAY));
        }

        await new Promise(r => setTimeout(r, MAIN_LOOP_DELAY));
    }
}

module.exports = {
    enqueueLog,
    workerLoop
};