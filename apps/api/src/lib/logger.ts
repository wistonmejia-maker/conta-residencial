import winston from 'winston';

/**
 * Structured logger using Winston
 * Spec v3.0 - Observabilidad
 */

const logLevel = process.env.LOG_LEVEL || 'info';

// Define custom format for development
const devFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
    })
);

// Define format for production (JSON)
const prodFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const logger = winston.createLogger({
    level: logLevel,
    format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
    defaultMeta: { service: 'conta-residencial-api' },
    transports: [
        new winston.transports.Console()
    ],
});

/**
 * Create a child logger with additional context
 * @param context - Additional metadata to include in all logs
 */
export function createLogger(context: Record<string, any>) {
    return logger.child(context);
}

/**
 * Add request ID to logger context
 * Useful for tracing requests across services
 */
export function addRequestId(requestId: string) {
    return logger.child({ requestId });
}

export default logger;
