'use strict';

/**
 * Integration tests: boots the Express app on a random port and checks the
 * routes, the admin access rules and the session handling.
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

test.before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    // Release the MySQL pool so the test process can exit.
    await db.close().catch(() => {});
});

function sessionCookie(user) {
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

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

test('every page renders', async () => {
    const pages = ['/', '/accsetup', '/dashboard', '/classes', '/assessment', '/quiz', '/materials', '/community'];

    for (const page of pages) {
        const res = await fetch(base + page);
        assert.strictEqual(res.status, 200, page + ' should render');
        const html = await res.text();
        assert.ok(html.includes('/js/shared.js'), page + ' loads the shared script');
        assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), page + ' has no inline script');
    }
});

test('the student pages need a session', async () => {
    const pages = ['/profile', '/analytics', '/messages'];

    for (const page of pages) {
        const res = await fetch(base + page, { redirect: 'manual' });
        assert.strictEqual(res.status, 302, page + ' should ask for a sign in');
        assert.strictEqual(res.headers.get('location'), '/accsetup?next=' + encodeURIComponent(page));
    }
});

test('the sidebar links point at their own pages', async () => {
    const html = await (await fetch(base + '/dashboard')).text();

    const links = {
        'folder-kanban': '/materials',
        'bar-chart-2': '/analytics',
        'users': '/community',
        'message-square': '/messages',
    };

    Object.keys(links).forEach((icon) => {
        const index = html.indexOf('data-lucide="' + icon + '"');
        assert.ok(index > -1, icon + ' is in the sidebar');

        const anchor = html.lastIndexOf('<a href="', index);
        const href = /<a href="([^"]+)"/.exec(html.slice(anchor));
        assert.strictEqual(href[1], links[icon], icon + ' links to ' + links[icon]);
    });
});

test('an unknown page returns 404', async () => {
    const res = await fetch(base + '/definitely-not-a-page');
    assert.strictEqual(res.status, 404);
});

/* ------------------------------------------------------------------ */
/* Admin access                                                        */
/* ------------------------------------------------------------------ */

test('the admin portal redirects signed out visitors to the login page', async () => {
    const res = await fetch(base + '/admin', { redirect: 'manual' });

    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get('location'), '/accsetup?next=%2Fadmin');
});

test('the admin portal refuses non-admin accounts', async () => {
    const res = await fetch(base + '/admin', {
        headers: {
            Cookie: sessionCookie({ id: 2, name: 'Alex', email: 'a@b.c', username: 'alex', role: 'student' }),
        },
        redirect: 'manual',
    });

    assert.strictEqual(res.status, 403);
    const body = await res.text();
    assert.ok(body.includes('403'), 'a 403 page is shown');
    assert.ok(body.includes('administrator'), 'the page explains why');
});

test('an admin account can open the admin portal', async () => {
    const res = await fetch(base + '/admin', {
        headers: {
            Cookie: sessionCookie({ id: 1, name: 'Charles', email: 'admin@quiznova.edu', username: 'admin', role: 'admin' }),
        },
        redirect: 'manual',
    });

    assert.strictEqual(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes('Admin Portal'), 'the admin portal renders');
    assert.ok(body.includes('>My Account<'), 'the admin has its own account page');
    assert.ok(!body.includes('>My account<'), 'the account button is not there twice');
    assert.ok(!body.includes('href="/dashboard"'), 'the portal does not lead into the student app');
});

test('the login page keeps the ?next hint', async () => {
    const res = await fetch(base + '/accsetup?next=%2Fadmin');
    const body = await res.text();

    assert.ok(body.includes('data-next="/admin"'), 'the next target is passed to the client');
});

test('already signed in users skip the login form', async () => {
    const admin = await fetch(base + '/accsetup', {
        headers: {
            Cookie: sessionCookie({ id: 1, name: 'Charles', email: 'admin@quiznova.edu', username: 'admin', role: 'admin' }),
        },
        redirect: 'manual',
    });

    assert.strictEqual(admin.status, 302);
    assert.strictEqual(admin.headers.get('location'), '/admin', 'admins go to the admin portal');

    const student = await fetch(base + '/accsetup', {
        headers: {
            Cookie: sessionCookie({ id: 2, name: 'Alex', email: 'a@b.c', username: 'alex', role: 'student' }),
        },
        redirect: 'manual',
    });

    assert.strictEqual(student.status, 302);
    assert.strictEqual(student.headers.get('location'), '/dashboard', 'students go to the dashboard');
});

test('the landing page depends on the role of the account', () => {
    const { landingFor, homeForRole, isAdmin } = require(path.join(ROOT, 'middleware', 'auth'));

    assert.strictEqual(homeForRole('admin'), '/admin');
    assert.strictEqual(homeForRole('student'), '/dashboard');
    assert.strictEqual(homeForRole(undefined), '/dashboard');

    assert.strictEqual(isAdmin({ role: 'admin' }), true);
    assert.strictEqual(isAdmin({ role: 'student' }), false);
    assert.strictEqual(isAdmin(null), false);

    const admin = { role: 'admin' };
    const student = { role: 'student' };

    assert.strictEqual(landingFor(admin), '/admin');
    assert.strictEqual(landingFor(student), '/dashboard');

    // A ?next= hint is honoured when the role may open it ...
    assert.strictEqual(landingFor(admin, '/admin'), '/admin');
    assert.strictEqual(landingFor(admin, '/classes'), '/classes');
    assert.strictEqual(landingFor(student, '/classes'), '/classes');

    // ... and dropped when it points at the other portal.
    assert.strictEqual(landingFor(student, '/admin'), '/dashboard');
    assert.strictEqual(landingFor(student, '/admin/overview'), '/dashboard');

    // External targets are never followed.
    assert.strictEqual(landingFor(admin, 'https://example.com'), '/admin');
    assert.strictEqual(landingFor(student, '//example.com'), '/dashboard');
});

test('the admin link is only rendered for administrators', async () => {
    const admin = await (await fetch(base + '/dashboard', {
        headers: {
            Cookie: sessionCookie({ id: 1, name: 'Charles', email: 'admin@quiznova.edu', username: 'admin', role: 'admin' }),
        },
    })).text();
    assert.ok(admin.includes('href="/admin"'), 'admins see the Admin Portal link');

    const student = await (await fetch(base + '/dashboard', {
        headers: {
            Cookie: sessionCookie({ id: 2, name: 'Alex', email: 'a@b.c', username: 'alex', role: 'student' }),
        },
    })).text();
    assert.ok(!student.includes('href="/admin"'), 'students do not see the Admin Portal link');
});

test('the student portal stays the student portal', async () => {
    const adminCookie = sessionCookie({ id: 1, name: 'Charles', email: 'admin@quiznova.edu', username: 'admin', role: 'admin' });
    const studentCookie = sessionCookie({ id: 2, name: 'Alex', email: 'a@b.c', username: 'alex', role: 'student' });

    const studentPages = ['/dashboard', '/classes', '/courses', '/assessment', '/materials', '/quiz', '/community', '/profile', '/analytics', '/messages'];

    // A refresh of a student page never opens the admin portal.
    for (const page of studentPages) {
        for (const [who, cookie] of [['admin', adminCookie], ['student', studentCookie]]) {
            const res = await fetch(base + page, { headers: { Cookie: cookie }, redirect: 'manual' });

            assert.ok(res.status === 200 || res.status === 302, page + ' opens for the ' + who);

            if (res.status === 302) {
                const location = res.headers.get('location') || '';
                assert.ok(location.indexOf('/admin') !== 0, page + ' does not open the admin for the ' + who);
            }
        }
    }

    // A student never gets into the portal.
    for (const page of ['/admin', '/admin/builder', '/admin/scores', '/admin/users', '/admin/settings', '/admin/messages']) {
        const res = await fetch(base + page, { headers: { Cookie: studentCookie }, redirect: 'manual' });
        assert.strictEqual(res.status, 403, page + ' refuses a student');
    }
});

/* ------------------------------------------------------------------ */
/* API guards                                                          */
/* ------------------------------------------------------------------ */

test('protected API routes need a session', async () => {
    const routes = [
        ['/api/classes/join', 'POST'],
        ['/api/attempts', 'POST'],
        ['/api/stats', 'GET'],
        ['/api/auth/me', 'GET'],
    ];

    for (const [route, method] of routes) {
        const res = await fetch(base + route, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method === 'POST' ? JSON.stringify({ code: 'CS101', slug: 'x', answers: [] }) : undefined,
        });
        assert.strictEqual(res.status, 401, route + ' should require a session');
    }
});

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

test('the admin link partial is included in the student sidebars', () => {
    const fs = require('fs');

    const partial = path.join(ROOT, 'views', 'partials', 'admin-link.ejs');
    assert.ok(fs.existsSync(partial), 'the partial exists');
    assert.ok(
        fs.readFileSync(partial, 'utf8').includes("user.role === 'admin'"),
        'the partial is only rendered for admins'
    );

    ['dashboard.ejs', 'classes.ejs', 'assessment.ejs'].forEach((file) => {
        const content = fs.readFileSync(path.join(ROOT, 'views', file), 'utf8');
        assert.ok(content.includes('partials/admin-link'), file + ' includes the admin link');
    });
});

test('search filters use textContent so they can be widened again', () => {
    const fs = require('fs');

    // innerText is empty for hidden elements, which turns a filter into a
    // one-way trap that can never be widened again.
    ['classes.js', 'assessment.js', 'dashboard.js', 'adminportal.js'].forEach((file) => {
        const content = fs.readFileSync(path.join(ROOT, 'public', 'js', file), 'utf8');
        assert.ok(!/\.innerText/.test(content), file + ' must not use innerText for matching');
        assert.ok(/\.textContent/.test(content), file + ' uses textContent for matching');
    });
});
