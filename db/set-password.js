'use strict';

/**
 * QuizNova - set the password of an account.
 *
 *   npm run db:password -- <email-or-username> <new-password>
 *   npm run db:password -- <email-or-username> --generate
 *
 * The password is hashed with scrypt (the same format the login route uses),
 * so the plain text is never stored.
 */

const crypto = require('crypto');

const db = require('../conn');
const { hashPassword } = require('../utils/password');

const MIN_LENGTH = 8;

/** A readable random password: 24 chars from an unambiguous alphabet. */
function generatePassword(length = 24) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i += 1) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
}

async function main() {
    const identifier = (process.argv[2] || '').trim();
    const argument = (process.argv[3] || '').trim();

    if (!identifier) {
        console.error('\nUsage:');
        console.error('  npm run db:password -- <email-or-username> <new-password>');
        console.error('  npm run db:password -- <email-or-username> --generate\n');
        process.exit(1);
    }

    const generate = argument === '--generate';
    const password = generate ? generatePassword() : argument;

    if (!password) {
        console.error('\n! No password given. Pass one, or use --generate.\n');
        process.exit(1);
    }

    if (password.length < MIN_LENGTH) {
        console.error(`\n! The password must be at least ${MIN_LENGTH} characters long.\n`);
        process.exit(1);
    }

    try {
        const user = await db.one(
            'SELECT id, full_name, username, email, role FROM users WHERE email = ? OR username = ? LIMIT 1',
            [identifier, identifier]
        );

        if (!user) {
            console.error(`\n! No account found for "${identifier}".\n`);
            process.exit(1);
        }

        const hash = await hashPassword(password);
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);

        console.log(`\n  ${user.full_name} (${user.email})`);
        console.log(`  role   : ${user.role}`);
        console.log('  password updated.');

        if (generate) {
            console.log(`\n  New password: ${password}\n`);
            console.log('  Sign out and back in with it.\n');
        } else {
            console.log('\n  Sign out and back in with the new password.\n');
        }
    } catch (err) {
        console.error('\n! Could not reach the database:', err.message);
        console.error('  Start MySQL and check DB_HOST / DB_USER / DB_PASSWORD in your .env\n');
        process.exit(1);
    } finally {
        await db.close();
    }
}

main();
