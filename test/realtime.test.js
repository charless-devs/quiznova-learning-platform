'use strict';

/**
 * The realtime stream (Server-Sent Events).
 *
 * A message of a student reaches the admin while the page is open and the
 * answer of the admin reaches the student the same way.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const app = require(path.join(ROOT, 'app'));
const auth = require(path.join(ROOT, 'middleware', 'auth'));
const realtime = require(path.join(ROOT, 'utils', 'realtime'));
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

/** Opens an event stream and collects the events. */
function listen(userCookie, events) {
    const controller = new AbortController();
    const received = [];

    const reading = fetch(
        base + '/api/events?events=' + encodeURIComponent(events.join(',')),
        {
            headers: { Cookie: userCookie, Accept: 'text/event-stream' },
            signal: controller.signal,
        }
    )
        .then((res) => {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            function pump() {
                return reader.read().then(({ done, value }) => {
                    if (done) return null;

                    buffer += decoder.decode(value, { stream: true });

                    let index;
                    while ((index = buffer.indexOf('\n\n')) !== -1) {
                        const raw = buffer.slice(0, index);
                        buffer = buffer.slice(index + 2);

                        const name = /^event: (.+)$/m.exec(raw);
                        const data = /^data: (.+)$/m.exec(raw);
                        if (name) received.push({ event: name[1], data: data ? data[1] : '' });
                    }

                    return pump();
                });
            }

            return pump();
        })
        .catch(() => null);

    return {
        received: received,
        stop: () => controller.abort(),
        reading: reading,
    };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function of(stream, event) {
    return stream.received.filter((item) => item.event === event);
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

test('the event stream needs a session', async () => {
    const res = await fetch(base + '/api/events');
    assert.strictEqual(res.status, 401);
});

test('the stream greets the subscriber', async () => {
    const stream = listen(cookie(STUDENT), ['presence']);

    await sleep(400);
    assert.ok(of(stream, 'connected').length >= 1, 'the subscriber is greeted');

    stream.stop();
});

test('a student message reaches the admin live', async () => {
    const adminStream = listen(cookie(ADMIN), ['message:new']);
    await sleep(300);

    const sent = await (
        await fetch(base + '/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
            body: JSON.stringify({
                subject: 'QuizNova Support',
                body: 'Does the admin see this at once?',
                category: 'support',
            }),
        })
    ).json();

    await sleep(400);

    const events = of(adminStream, 'message:new');
    assert.strictEqual(events.length, 1, 'the admin got exactly one event');

    const payload = JSON.parse(events[0].data);
    assert.strictEqual(payload.id, sent.message.id);
    assert.strictEqual(payload.body, 'Does the admin see this at once?');
    assert.strictEqual(payload.user_name, 'Alex Morgan');

    // The admin answers and the student hears it live.
    const studentStream = listen(cookie(STUDENT), ['message:reply']);
    await sleep(300);

    await fetch(base + '/api/admin/messages/' + sent.message.id + '/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie(ADMIN) },
        body: JSON.stringify({ reply: 'Yes, at once.', status: 'answered' }),
    });

    await sleep(400);

    const replies = of(studentStream, 'message:reply');
    assert.strictEqual(replies.length, 1, 'the student got the answer');
    assert.strictEqual(JSON.parse(replies[0].data).reply, 'Yes, at once.');

    adminStream.stop();
    studentStream.stop();

    // The test does not leave the message in the database.
    await db.execute('DELETE FROM messages WHERE id = ?', [sent.message.id]);
});

test('a student never receives the admin inbox events', async () => {
    const studentStream = listen(cookie(STUDENT), ['message:new']);
    await sleep(300);

    const sent = await (
        await fetch(base + '/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
            body: JSON.stringify({ subject: 'QuizNova Support', body: 'Only for the admins.' }),
        })
    ).json();

    await sleep(400);

    assert.strictEqual(of(studentStream, 'message:new').length, 0, 'nothing leaked');

    studentStream.stop();

    await db.execute('DELETE FROM messages WHERE id = ?', [sent.message.id]);
});

test('the bus only sends what a subscriber asked for', () => {
    const sent = [];
    let close = null;

    const fake = {
        writeHead: () => {},
        write: (chunk) => sent.push(chunk),
        on: (event, handler) => {
            if (event === 'close') close = handler;
        },
    };
    const fakeReq = {
        query: { events: 'message:new' },
        on: (event, handler) => {
            if (event === 'close') close = handler;
        },
    };

    realtime.subscribe(fakeReq, fake, { uid: 1, role: 'admin' });

    const before = sent.length;
    realtime.publish('message:new', { hello: 'world' });
    realtime.publish('something:else', { hello: 'world' });

    const chunk = sent.slice(before).join('');
    assert.ok(chunk.includes('event: message:new'), 'the wanted event is sent');
    assert.ok(!chunk.includes('event: something:else'), 'the other event is not');

    // Close the subscriber again so the heartbeat stops.
    if (close) close();
});

test('the pages use the realtime helper', () => {
    const shared = fs.readFileSync(path.join(ROOT, 'public', 'js', 'shared.js'), 'utf8');
    const messages = fs.readFileSync(path.join(ROOT, 'public', 'js', 'messages.js'), 'utf8');
    const adminMessages = fs.readFileSync(path.join(ROOT, 'public', 'js', 'adminmessages.js'), 'utf8');
    const profile = fs.readFileSync(path.join(ROOT, 'public', 'js', 'profile.js'), 'utf8');

    assert.ok(shared.includes('QN.realtime'), 'the helper exists');
    assert.ok(shared.includes('new global.EventSource'), 'it opens an event stream');

    assert.ok(messages.includes("QN.realtime.connect(['message:reply'"), 'the student listens');
    assert.ok(adminMessages.includes("QN.realtime.connect(['message:new'"), 'the admin listens');
    assert.ok(profile.includes("QN.realtime.connect(['stats:updated'"), 'the progress listens');
});
