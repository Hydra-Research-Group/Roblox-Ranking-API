const winston = require("winston");
const moment = require("moment");

const timestampFormat = () => moment().format("DD/MM/YYYY HH:mm");

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp({ format: timestampFormat }),
        winston.format.printf((info) => {
            const { timestamp, level, message, ...meta } = info;

            let metaStr = "";
            if (Object.keys(meta).length) {
                metaStr = "\n" + JSON.stringify(meta, null, 2);
            }

            return `${timestamp} [${level}] ${message}${metaStr}`;
        })
    ),
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;