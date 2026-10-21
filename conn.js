'use strict';

/**
 * QuizNova - MySQL connection layer.
 *
 * Uses mysql2 (promise API) so it can talk to MySQL 8 with the default
 * caching_sha2_password authentication. Every helper rejects with a friendly
 * message instead of a raw driver error, and the app keeps running (with the
 * data features disabled) when MySQL is not reachable.
 */

const mysql = require('mysql2/promise');

const { db } = require('./config');

const pool = mysql.createPool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    waitForConnections: true,
    connectionLimit: db.poolSize,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
});

/** Last known database state (refreshed by ping()). */
let dbAvailable = false;
let lastError = null;

const FRIENDLY_ERRORS = {
    ER_ACCESS_DENIED_ERROR: 'Database access denied. Check DB_USER / DB_PASSWORD in your .env file.',
    ER_BAD_DB_ERROR: 'Database "' + db.database + '" does not exist. Run "npm run db:setup" to create it.',
    ER_NOT_SUPPORTED_AUTH_MODE:
        'MySQL refused the login method. Use a user with mysql_native_password or caching_sha2_password.',
    ECONNREFUSED: 'Cannot reach MySQL on ' + db.host + ':' + db.port + '. Is the MySQL service running?',
    ETIMEDOUT: 'MySQL connection timed out.',
    ENOTFOUND: 'MySQL host "' + db.host + '" could not be found.',
    PROTOCOL_CONNECTION_LOST: 'Lost connection to MySQL.',
};

function friendlyError(err) {
    const message = FRIENDLY_ERRORS[err.code] || err.message || 'Unknown database error.';
    const wrapped = new Error(message);
    wrapped.code = err.code;
    wrapped.cause = err;
    return wrapped;
}

pool.on('error', (err) => {
    // Idle pool connections can drop; log and let the next query re-establish.
    dbAvailable = false;
    lastError = err;
    console.error('[db] pool error:', err.code || err.message);
});

/** Run a query and resolve with the rows. */
async function query(sql, params = []) {
    try {
        const [rows] = await pool.query(sql, params);
        dbAvailable = true;
        lastError = null;
        return rows;
    } catch (err) {
        throw friendlyError(err);
    }
}

/** Run a query and resolve with the first row (or null). */
async function one(sql, params = []) {
    const rows = await query(sql, params);
    return rows.length ? rows[0] : null;
}

/** Run a write statement and resolve with the result summary. */
async function execute(sql, params = []) {
    try {
        const [result] = await pool.query(sql, params);
        dbAvailable = true;
        lastError = null;
        return {
            insertId: result.insertId,
            affectedRows: result.affectedRows,
            changedRows: result.changedRows,
        };
    } catch (err) {
        throw friendlyError(err);
    }
}

/**
 * Run a set of statements inside a single transaction.
 * The callback receives a connection-scoped helper with the same shape.
 */
async function transaction(handler) {
    const connection = await pool.getConnection();

    const scoped = {
        async query(sql, params = []) {
            const [rows] = await connection.query(sql, params);
            return rows;
        },
        async one(sql, params = []) {
            const [rows] = await connection.query(sql, params);
            return rows.length ? rows[0] : null;
        },
        async execute(sql, params = []) {
            const [result] = await connection.query(sql, params);
            return {
                insertId: result.insertId,
                affectedRows: result.affectedRows,
                changedRows: result.changedRows,
            };
        },
    };

    try {
        await connection.beginTransaction();
        const result = await handler(scoped);
        await connection.commit();
        return result;
    } catch (err) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('[db] rollback failed:', rollbackError.message);
        }
        throw friendlyError(err);
    } finally {
        connection.release();
    }
}

/** Check the connection. Resolves to true/false, never throws. */
async function ping() {
    try {
        await pool.query('SELECT 1 AS ok');
        dbAvailable = true;
        lastError = null;
        return true;
    } catch (err) {
        dbAvailable = false;
        lastError = err;
        return false;
    }
}

/** Cached availability flag (use ping() for a live check). */
function isAvailable() {
    return dbAvailable;
}

function getConfig() {
    return { ...db };
}

function getLastError() {
    return lastError;
}

async function close() {
    await pool.end();
}

module.exports = {
    pool,
    query,
    one,
    execute,
    transaction,
    ping,
    isAvailable,
    getConfig,
    getLastError,
    close,
};
