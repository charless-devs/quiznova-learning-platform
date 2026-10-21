'use strict';

/**
 * QuizNova - promote an account to administrator.
 *
 *   npm run db:promote -- <email-or-username>
 *   npm run db:promote -- <email-or-username> student
 *
 * The second argument sets a different role (student / instructor / admin).
 */

const db = require('../conn');

async function main() {
    const identifier = (process.argv[2] || '').trim();
    const role = (process.argv[3] || 'admin').trim().toLowerCase();

    if (!identifier) {
        console.error('\nUsage: npm run db:promote -- <email-or-username> [admin|instructor|student]\n');
        process.exit(1);
    }

    if (['admin', 'instructor', 'student'].indexOf(role) === -1) {
        console.error(`\n! Unknown role "${role}". Use admin, instructor or student.\n`);
        process.exit(1);
    }

    try {
        const user = await db.one(
            'SELECT id, full_name, username, email, role FROM users WHERE email = ? OR username = ? LIMIT 1',
            [identifier, identifier]
        );

        if (!user) {
            console.error(`\n! No account found for "${identifier}".\n`);
            console.error('  Create the account first at http://localhost:3000/accsetup\n');
            process.exit(1);
        }

        await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, user.id]);

        console.log(`\n  ${user.full_name} (${user.email})`);
        console.log(`  role: ${user.role} -> ${role}`);
        console.log('\n  Done. Sign out and back in to pick up the new role.\n');
    } catch (err) {
        console.error('\n! Could not reach the database:', err.message);
        console.error('  Start MySQL and check DB_HOST / DB_USER / DB_PASSWORD in your .env\n');
        process.exit(1);
    } finally {
        await db.close();
    }
}

main();
