'use strict';

/**
 * The sessions of two browsers have to stay apart.
 *
 * Signing in as an administrator in one browser must never open the admin
 * portal in another one, and the role of a session always comes from the
 * account in the database - never from the cookie.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app = require(path.join(ROOT, 'app'));
const auth = require(path.join(ROOT, 'middleware', 'auth'));
const db = require(path.join(ROOT, 'conn'));

let server;
let base;
let dbReady = false;

test.before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    dbReady = await db.ping();
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close().catch(() => {});
});

/** A session cookie for an account of the demo data. */
function cookieOf(user) {
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

const ADMIN = { id: 1, name: 'Charles Admin', email: 'admin@quiznova.edu', username: 'admin', role: 'admin' };
const STUDENT = { id: 2, name: 'Alex Morgan', email: 'alex.morgan@example.com', username: 'alex', role: 'student' };

async function page(pathname, cookie) {
    const res = await fetch(base + pathname, {
        headers: cookie ? { Cookie: cookie } : {},
        redirect: 'manual',
    });
    const body = await res.text();
    return { status: res.status, location: res.headers.get('location'), body, headers: res.headers };
}

/* ------------------------------------------------------------------ */
/* One browser, one session                                            */
/* ------------------------------------------------------------------ */

test('the admin portal of one browser does not open in another one', async () => {
    const admin = await page('/dashboard', cookieOf(ADMIN));
    assert.strictEqual(admin.status, 200, 'the dashboard opens for the admin');
    assert.ok(admin.body.includes('href="/admin"'), 'the admin sees the way to the portal');

    const student = await page('/dashboard', cookieOf(STUDENT));
    assert.ok(!student.body.includes('href="/admin"'), 'the student does not see it');

    const guest = await page('/dashboard');
    assert.ok(!guest.body.includes('href="/admin"'), 'a visitor without a session does not see it');
    assert.strictEqual(guest.status, 200, 'the dashboard itself still renders');
});

test('the student dashboard never opens the admin portal', async () => {
    const res = await page('/dashboard', cookieOf(STUDENT));

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.location, null, 'the dashboard stays where it is');
    assert.ok(!res.body.includes('href="/admin"'), 'no admin link on the dashboard');
});

test('the admin portal needs an administrator of this browser', async () => {
    const student = await page('/admin', cookieOf(STUDENT));
    assert.strictEqual(student.status, 403, 'a student is refused');

    const guest = await page('/admin');
    assert.strictEqual(guest.status, 302, 'a visitor is sent to the login page');
    assert.strictEqual(guest.location, '/accsetup?next=%2Fadmin');
});

/* ------------------------------------------------------------------ */
/* The role comes from the database                                   */
/* ------------------------------------------------------------------ */

test('a session cannot fake the admin role', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    // The cookie of a student that claims to be an administrator.
    const token = auth.encodeSession({
        uid: STUDENT.id,
        name: STUDENT.name,
        email: STUDENT.email,
        username: STUDENT.username,
        role: 'admin',
        exp: Date.now() + 60000,
    });

    const dashboard = await page('/dashboard', `qn_session=${token}`);
    assert.ok(!dashboard.body.includes('href="/admin"'), 'the dashboard stays a student dashboard');

    const portal = await page('/admin', `qn_session=${token}`);
    assert.strictEqual(portal.status, 403, 'the admin portal stays closed');
});

test('the session of an account that does not exist is dropped', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const gone = await auth.liveAccount({
        uid: 987654321,
        name: 'Ghost',
        email: 'ghost@example.com',
        username: 'ghost',
        role: 'admin',
        exp: Date.now() + 60000,
    });

    assert.strictEqual(gone, null, 'a session without an account is not a session');
});

/* ------------------------------------------------------------------ */
/* The cookie                                                          */
/* ------------------------------------------------------------------ */

test('remember me decides how long the cookie lives', () => {
    const user = { id: 1, full_name: 'Charles Admin', email: 'admin@quiznova.edu', username: 'admin', role: 'admin' };

    const remembered = { header: null };
    auth.startSession({ setHeader: (name, value) => { remembered.header = value; } }, user, true);
    assert.ok(remembered.header.includes('Max-Age='), 'remember me keeps the cookie for a week');
    assert.ok(remembered.header.includes('HttpOnly'));
    assert.ok(remembered.header.includes('SameSite=Lax'));

    const temporary = { header: null };
    auth.startSession({ setHeader: (name, value) => { temporary.header = value; } }, user, false);
    assert.ok(!temporary.header.includes('Max-Age='), 'without remember me the cookie dies with the browser');
    assert.ok(temporary.header.includes('HttpOnly'));
});

test('every sign in gets its own session id', () => {
    const user = { id: 1, full_name: 'Charles Admin', email: 'admin@quiznova.edu', username: 'admin', role: 'admin' };

    const first = auth.encodeSession({
        uid: user.id,
        name: user.full_name,
        email: user.email,
        username: user.username,
        role: user.role,
        sid: 'first',
        iat: Date.now(),
        exp: Date.now() + 60000,
    });
    const second = auth.encodeSession({
        uid: user.id,
        name: user.full_name,
        email: user.email,
        username: user.username,
        role: user.role,
        sid: 'second',
        iat: Date.now(),
        exp: Date.now() + 60000,
    });

    assert.notStrictEqual(first, second, 'two browsers never carry the same cookie');
    assert.strictEqual(auth.decodeSession(first).sid, 'first');
    assert.strictEqual(auth.decodeSession(second).sid, 'second');
});

/* ------------------------------------------------------------------ */
/* The cache                                                           */
/* ------------------------------------------------------------------ */

test('the pages are never kept by a browser or a proxy', async () => {
    const res = await page('/dashboard', cookieOf(ADMIN));

    const cacheControl = res.headers.get('cache-control') || '';
    assert.ok(cacheControl.includes('no-store'), 'the page is not stored');
    assert.ok(cacheControl.includes('private'), 'the page belongs to this browser only');
    assert.ok((res.headers.get('vary') || '').includes('Cookie'), 'the cache keys on the session');
    assert.strictEqual(res.headers.get('etag'), null, 'there is no etag to revalidate with');
});
