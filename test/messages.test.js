'use strict';

/**
 * The student messages and the admin inbox.
 *
 * A message to QuizNova Support is stored, reaches the admin and the answer
 * comes back to the student.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

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
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test('the database has a messages table', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');

    assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS `messages`'), 'the table is created');
    assert.ok(schema.includes('`status`'), 'a message has a status');
    assert.ok(schema.includes('`reply`'), 'a message can hold the answer');
});

test('the message API needs a session', async () => {
    const res = await fetch(base + '/api/messages');
    assert.strictEqual(res.status, 401);
});

test('a student cannot read the admin inbox', async () => {
    const res = await fetch(base + '/api/admin/messages', { headers: { Cookie: cookie(STUDENT) } });
    assert.strictEqual(res.status, 403);
});

test('a student cannot open the admin inbox page', async () => {
    const res = await fetch(base + '/admin/messages', {
        headers: { Cookie: cookie(STUDENT) },
        redirect: 'manual',
    });
    assert.strictEqual(res.status, 403);
});

test('the admin inbox page is a link of the admin portal', () => {
    const portal = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'adminportal.ejs'), 'utf8');
    assert.ok(portal.includes('href="/admin/messages"'), 'the portal links to the inbox');
});

test('a student message reaches the admin and the answer comes back', async () => {
    // The student writes to QuizNova Support.
    const sent = await (
        await fetch(base + '/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
            body: JSON.stringify({
                subject: 'QuizNova Support',
                body: 'My quiz score looks wrong.',
                category: 'support',
            }),
        })
    ).json();

    assert.strictEqual(sent.ok, true);
    assert.strictEqual(sent.message.status, 'open');

    // The admin inbox holds it.
    const inbox = await (
        await fetch(base + '/api/admin/messages', { headers: { Cookie: cookie(ADMIN) } })
    ).json();
    assert.strictEqual(inbox.ok, true);
    assert.ok(
        inbox.messages.some((message) => message.id === sent.message.id),
        'the message is in the inbox'
    );

    // The admin answers.
    const answered = await (
        await fetch(base + '/api/admin/messages/' + sent.message.id + '/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie(ADMIN) },
            body: JSON.stringify({ reply: 'Your score is correct.', status: 'answered' }),
        })
    ).json();

    assert.strictEqual(answered.ok, true);
    assert.strictEqual(answered.message.status, 'answered');

    // The student sees the answer.
    const mine = await (
        await fetch(base + '/api/messages', { headers: { Cookie: cookie(STUDENT) } })
    ).json();
    const message = mine.messages.find((item) => item.id === sent.message.id);

    assert.ok(message, 'the student still has the message');
    assert.strictEqual(message.reply, 'Your score is correct.');

    // And the answer shows up on the page.
    const page = await (
        await fetch(base + '/messages', { headers: { Cookie: cookie(STUDENT) } })
    ).text();
    assert.ok(page.includes('My quiz score looks wrong.'), 'the message is shown');
    assert.ok(page.includes('Your score is correct.'), 'the answer is shown');

    // The test does not leave the message in the database.
    await db.execute('DELETE FROM messages WHERE id = ?', [sent.message.id]);
});

test('a message needs a subject and a body', async () => {
    const res = await fetch(base + '/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
        body: JSON.stringify({ subject: '', body: '' }),
    });

    assert.strictEqual(res.status, 400);
    const payload = await res.json();
    assert.ok(payload.errors.subject, 'the subject is checked');
    assert.ok(payload.errors.body, 'the body is checked');
});

test('the messages page needs a session', async () => {
    const res = await fetch(base + '/messages', { redirect: 'manual' });
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get('location'), '/accsetup?next=%2Fmessages');
});

test('the support conversation is the one that reaches the admin', () => {
    const page = fs.readFileSync(path.join(ROOT, 'views', 'messages.ejs'), 'utf8');
    const script = fs.readFileSync(path.join(ROOT, 'public', 'js', 'messages.js'), 'utf8');

    assert.ok(page.includes('data-thread='), 'the conversations are marked');
    assert.ok(page.includes("thread: 'support'"), 'the support conversation is marked');
    assert.ok(script.includes("'/api/messages'"), 'the support thread posts to the API');
    assert.ok(script.includes("category: 'support'"), 'it is sent as a support message');
});
