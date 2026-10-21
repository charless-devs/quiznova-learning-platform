'use strict';

/**
 * QuizNova - configuration.
 *
 * Loads the .env file (if present) into process.env and exposes the
 * settings used by the app. No extra dependency required.
 */

const fs = require('fs');
const path = require('path');

/** Minimal .env parser: KEY=VALUE lines, # comments, optional quotes. */
function loadEnvFile(file = path.join(__dirname, '.env')) {
    if (!fs.existsSync(file)) return;

    const content = fs.readFileSync(file, 'utf8');

    content.split('\n').forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) return;

        const index = line.indexOf('=');
        if (index === -1) return;

        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
}

loadEnvFile();

const config = {
    port: Number(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    db: {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'quiznova',
        // A serverless app opens a few connections per instance - a small
        // pool keeps the database happy.
        poolSize: Number(process.env.DB_POOL_SIZE) || 5,
        // A hosted database (Aiven, PlanetScale, ...) wants an encrypted
        // connection: DB_SSL=1 turns it on, DB_SSL_CA points to the
        // certificate of the provider.
        ssl: process.env.DB_SSL || '',
        sslCa: process.env.DB_SSL_CA || '',
    },

    sessionSecret: process.env.SESSION_SECRET || 'quiznova-dev-secret-change-me',
};

module.exports = config;
