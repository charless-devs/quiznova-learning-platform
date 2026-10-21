'use strict';

/**
 * No broken characters.
 *
 * A text that was encoded as Windows-1252 and read as UTF-8 shows up as a
 * bullet written as three characters, "Schrodinger" with a broken o or an
 * emoji as four strange letters. This test walks every file and every page
 * and makes sure the garbage is gone.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* The signs of a broken encoding (as escapes, so the file itself is clean). */
const BROKEN = /\u00e2\u20ac|\u00c3[\x80-\xbf]|\u00c2[\x80-\xbf]|\u00f0\u0178|\u00ef\u00bb\u00bf|\ufffd/g;

/** Every file of the project (without node_modules). */
function collect(folder, files) {
    fs.readdirSync(folder, { withFileTypes: true }).forEach(function (entry) {
        if (entry.name === 'node_modules' || entry.name === '.git') return;

        const full = path.join(folder, entry.name);

        if (entry.isDirectory()) return collect(full, files);
        if (!/\.(ejs|js|css|md|sql|json|txt)$/.test(entry.name)) return;

        files.push(full);
    });

    return files;
}

test('no file of the project has broken characters', () => {
    const files = collect(ROOT, []);
    const problems = [];

    files.forEach(function (file) {
        const content = fs.readFileSync(file, 'utf8');
        const matches = content.match(BROKEN) || [];

        if (matches.length) {
            const at = content.indexOf(matches[0]);
            problems.push(
                path.relative(ROOT, file) +
                    ' -> ' +
                    matches.length +
                    ' broken character(s): ' +
                    JSON.stringify(content.slice(Math.max(0, at - 30), at + 30))
            );
        }
    });

    assert.deepStrictEqual(problems, [], problems.join('\n'));
});

test('the pages of the app have no broken characters', async () => {
    const app = require(path.join(ROOT, 'app'));
    const auth = require(path.join(ROOT, 'middleware', 'auth'));
    const db = require(path.join(ROOT, 'conn'));

    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;

    const jar = (user) =>
        'qn_session=' +
        auth.encodeSession({
            uid: user.id,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
            exp: Date.now() + 600000,
        });

    const pages = [
        '/',
        '/accsetup',
        '/dashboard',
        '/classes',
        '/courses',
        '/materials',
        '/assessment',
        '/community',
        '/quiz',
        '/profile',
        '/analytics',
        '/messages',
        '/settings',
        '/admin',
        '/admin/builder',
        '/admin/scores',
        '/admin/users',
        '/admin/courses',
        '/admin/messages',
        '/admin/settings',
        '/admin/account',
    ];

    const problems = [];

    try {
        for (const page of pages) {
            const res = await fetch(base + page, {
                headers: { Cookie: jar({ id: 1, name: 'Charles Admin', email: 'admin@quiznova.edu', username: 'admin', role: 'admin' }) },
                redirect: 'manual',
            });

            const html = await res.text();
            const matches = html.match(BROKEN) || [];

            if (matches.length) {
                const at = html.indexOf(matches[0]);
                problems.push(page + ' -> ' + JSON.stringify(html.slice(Math.max(0, at - 30), at + 30)));
            }
        }
    } finally {
        server.close();
    }

    assert.deepStrictEqual(problems, [], problems.join('\n'));
});

test('the database has no broken characters', async (t) => {
    const db = require(path.join(ROOT, 'conn'));

    const ready = await db.ping();
    if (!ready) return t.skip('the database is not reachable');

    const tables = [
        { table: 'classes', columns: ['title', 'description', 'schedule', 'instructor'] },
        { table: 'quizzes', columns: ['title', 'subject', 'instructions'] },
        { table: 'questions', columns: ['prompt', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e'] },
        { table: 'messages', columns: ['subject', 'body', 'reply'] },
        { table: 'courses', columns: ['title', 'subject', 'description'] },
        { table: 'course_videos', columns: ['title', 'description'] },
        { table: 'users', columns: ['full_name', 'username', 'email'] },
    ];

    const problems = [];

    for (const entry of tables) {
        const rows = await db.query('SELECT * FROM `' + entry.table + '`');

        rows.forEach(function (row) {
            entry.columns.forEach(function (column) {
                const value = row[column];
                if (typeof value !== 'string') return;

                const matches = value.match(BROKEN) || [];
                if (matches.length) problems.push(entry.table + '.' + column + ' -> ' + JSON.stringify(value.slice(0, 60)));
            });
        });
    }

    await db.close().catch(() => {});

    assert.deepStrictEqual(problems, [], problems.join('\n'));
});
