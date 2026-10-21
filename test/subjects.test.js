'use strict';

/**
 * The subject catalogue.
 *
 * One list of subjects drives every picker of the app: the registration,
 * the settings, the class creation, the practice quiz and the exam builder.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const subjects = require(path.join(ROOT, 'data', 'subjects'));

const app = require(path.join(ROOT, 'app'));
const auth = require(path.join(ROOT, 'middleware', 'auth'));
const db = require(path.join(ROOT, 'conn'));

let server;
let base;

const STUDENT = {
    id: 2,
    name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    username: 'alex',
    role: 'student',
};

const ADMIN = {
    id: 1,
    name: 'Charles Admin',
    email: 'admin@quiznova.edu',
    username: 'admin',
    role: 'admin',
};

function cookie(user) {
    const token = auth.encodeSession({
        uid: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        exp: Date.now() + 60000,
    });
    return `qn_session=${token}`;
}

/** The templates escape the values, so the test has to do the same. */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

test.before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close().catch(() => {});
});

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

test('the catalogue holds the core subjects and many more', () => {
    const names = subjects.names();

    // The subjects that were always there.
    ['Mathematics', 'Computer Science', 'English', 'Science', 'Physics', 'History'].forEach((name) => {
        assert.ok(names.includes(name), name + ' is in the catalogue');
    });

    // 20 more than the original ten.
    assert.ok(subjects.SUBJECTS.length >= 30, 'there are at least 30 subjects');
});

test('the catalogue has the basics and the IT subjects', () => {
    const names = subjects.names();

    assert.ok(names.includes('Basic Mathematics'), 'a basic subject is there');
    assert.ok(names.includes('Basic Science'), 'a basic subject is there');
    assert.ok(names.includes('Basic English'), 'a basic subject is there');
    assert.ok(names.includes('IT for Students'), 'the IT subject is there');
    assert.ok(names.includes('Cybersecurity Basics'), 'a basic subject is there');
});

test('every subject has a name, an icon and a colour', () => {
    const seen = new Set();

    subjects.SUBJECTS.forEach((subject) => {
        assert.ok(subject.name, 'it has a name');
        assert.ok(subject.icon, subject.name + ' has an icon');
        assert.ok(/^#[0-9a-f]{6}$/i.test(subject.color), subject.name + ' has a colour');
        assert.ok(subject.group, subject.name + ' has a group');

        assert.ok(!seen.has(subject.name), subject.name + ' is only listed once');
        seen.add(subject.name);
    });
});

test('every subject belongs to a known group', () => {
    const groups = subjects.GROUPS.map((group) => group.key);

    subjects.SUBJECTS.forEach((subject) => {
        assert.ok(groups.includes(subject.group), subject.name + ' is in a known group');
    });
});

test('a subject is found by its name', () => {
    assert.strictEqual(subjects.find('Mathematics').icon, 'calculator');
    assert.strictEqual(subjects.find('mathematics').icon, 'calculator');
    assert.strictEqual(subjects.find('Nothing'), null);
    assert.strictEqual(subjects.iconOf('IT for Students'), 'laptop');
    assert.strictEqual(subjects.iconOf('Nothing'), 'book-open');
    assert.ok(subjects.colorOf('Mathematics'));
});

/* ------------------------------------------------------------------ */
/* The pickers                                                         */
/* ------------------------------------------------------------------ */

test('the registration offers every subject', async () => {
    const html = await (await fetch(base + '/accsetup')).text();

    subjects.names().forEach((name) => {
        assert.ok(html.includes('value="' + escapeHtml(name) + '"'), name + ' can be picked');
    });
});

test('the settings offer every subject', async () => {
    const html = await (await fetch(base + '/settings', { headers: { Cookie: cookie(STUDENT) } })).text();

    subjects.names().forEach((name) => {
        assert.ok(html.includes('value="' + escapeHtml(name) + '"'), name + ' can be picked');
    });
});

test('the class creation offers every subject', async () => {
    const html = await (await fetch(base + '/classes', { headers: { Cookie: cookie(STUDENT) } })).text();

    subjects.names().forEach((name) => {
        assert.ok(html.includes('value="' + escapeHtml(name) + '"'), name + ' can be picked');
    });
});

test('the exam builder lists every subject', async () => {
    const html = await (await fetch(base + '/admin/builder', { headers: { Cookie: cookie(ADMIN) } })).text();

    const buttons = (html.match(/class="subject-btn/g) || []).length;
    assert.strictEqual(buttons, subjects.SUBJECTS.length, 'every subject has a button');

    subjects.names().forEach((name) => {
        assert.ok(html.includes('data-subject="' + escapeHtml(name) + '"'), name + ' is in the builder');
    });
});

test('the progress model uses the colour of the catalogue', () => {
    const progress = require(path.join(ROOT, 'data', 'progress'));

    const model = progress.buildProgress(
        [
            {
                title: 'Math midterm',
                subject: 'Mathematics',
                slug: 'math',
                score: 80,
                correct_count: 8,
                total_questions: 10,
                time_spent_seconds: 600,
                submitted_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
            },
        ],
        []
    );

    const math = model.subjects.find((subject) => subject.name === 'Mathematics');
    assert.strictEqual(math.color, subjects.find('Mathematics').color, 'the colour comes from the catalogue');
    assert.strictEqual(math.icon, subjects.find('Mathematics').icon, 'the icon comes from the catalogue');
});
