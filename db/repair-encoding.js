'use strict';

/**
 * QuizNova - the command that repairs the broken characters.
 *
 *   node db/repair-encoding.js
 *
 * It goes through the files of the project and through the text of the
 * database and puts the original characters back.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const encoding = require(path.join(ROOT, 'utils', 'encoding'));
const db = require(path.join(ROOT, 'conn'));

/* The tables and the text columns of the platform. */
const TABLES = [
    { table: 'classes', columns: ['title', 'description', 'schedule', 'instructor', 'department'] },
    { table: 'quizzes', columns: ['title', 'subject', 'instructions'] },
    { table: 'questions', columns: ['prompt', 'code_snippet', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'explanation'] },
    { table: 'messages', columns: ['subject', 'body', 'reply'] },
    { table: 'courses', columns: ['title', 'subject', 'description', 'instructor'] },
    { table: 'course_videos', columns: ['title', 'description', 'file_name'] },
    { table: 'settings', columns: ['setting_value'] },
    { table: 'subject_settings', columns: ['subject'] },
    { table: 'users', columns: ['full_name', 'username', 'email', 'subject'] },
];

function walk(folder, files) {
    fs.readdirSync(folder, { withFileTypes: true }).forEach(function (entry) {
        if (entry.name === 'node_modules' || entry.name === '.git') return;

        const full = path.join(folder, entry.name);

        if (entry.isDirectory()) return walk(full, files);
        if (!/\.(ejs|js|css|md|sql|json|txt)$/.test(entry.name)) return;

        files.push(full);
    });

    return files;
}

async function main() {
    console.log('QuizNova - the repair of the broken characters');
    console.log('---------------------------------------------\n');

    let repaired = 0;

    // 1. The files.
    const files = walk(ROOT, []);

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const result = encoding.repair(content);

        if (!result.fixed) continue;

        fs.writeFileSync(file, result.text, 'utf8');
        repaired += 1;

        console.log('  ' + path.relative(ROOT, file) + ' - repaired');
    }

    console.log('\n  the files: ' + repaired + ' repaired');

    // 2. The database.
    let rows = 0;

    try {
        const ready = await db.ping();
        if (!ready) {
            console.log('  the database is not reachable - it was skipped');
        } else {
            for (const entry of TABLES) {
                const list = await db.query('SELECT * FROM `' + entry.table + '`');

                for (const row of list) {
                    const updates = [];

                    entry.columns.forEach(function (column) {
                        const result = encoding.repair(row[column]);
                        if (result.fixed) updates.push({ column: column, value: result.text });
                    });

                    if (!updates.length) continue;

                    const sets = updates.map((item) => '`' + item.column + '` = ?').join(', ');
                    const values = updates.map((item) => item.value);

                    await db.execute(
                        'UPDATE `' + entry.table + '` SET ' + sets + ' WHERE id = ?',
                        values.concat([row.id])
                    );

                    rows += 1;
                    console.log('  ' + entry.table + ' #' + row.id + ' - repaired');
                }
            }

            console.log('\n  the database: ' + rows + ' rows repaired');
        }
    } catch (err) {
        console.error('\n  the database could not be read: ' + err.message);
    } finally {
        await db.close().catch(() => {});
    }

    console.log('\n  Done.\n');
}

if (require.main === module) {
    main();
}

module.exports = { main };
