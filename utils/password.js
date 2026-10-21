'use strict';

/**
 * QuizNova - password hashing.
 *
 * Uses Node's built-in scrypt so no native dependency is required.
 * Stored format: scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
 */

const crypto = require('crypto');

const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16);
        crypto.scrypt(password, salt, PARAMS.keylen, PARAMS, (err, derived) => {
            if (err) return reject(err);
            resolve(
                `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('hex')}$${derived.toString('hex')}`
            );
        });
    });
}

function verifyPassword(password, stored) {
    return new Promise((resolve) => {
        if (!stored || typeof stored !== 'string') return resolve(false);

        const parts = stored.split('$');
        if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);

        const [, N, r, p, saltHex, hashHex] = parts;
        const salt = Buffer.from(saltHex, 'hex');
        const expected = Buffer.from(hashHex, 'hex');

        crypto.scrypt(
            password,
            salt,
            expected.length,
            { N: Number(N), r: Number(r), p: Number(p) },
            (err, derived) => {
                if (err) return resolve(false);
                resolve(derived.length === expected.length && crypto.timingSafeEqual(derived, expected));
            }
        );
    });
}

module.exports = { hashPassword, verifyPassword };
