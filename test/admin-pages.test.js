'use strict';

/**
 * The pages that were split out: the courses and the admin sections.
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
/* The courses                                                         */
/* ------------------------------------------------------------------ */

test('the courses have their own page', async () => {
    const res = await fetch(base + '/courses');
    assert.strictEqual(res.status, 200);

    const html = await res.text();
    assert.ok(html.includes('id="coursesGrid"'), 'the grid is on the page');
    assert.ok(html.includes('id="courseModal"'), 'the modal is on the page');
    assert.ok(html.includes('/js/courses.js'), 'the page has its own script');
    assert.ok(html.includes('/css/courses.css'), 'the page has its own stylesheet');
});

test('the dashboard only keeps a summary of the courses', () => {
    const dashboard = fs.readFileSync(path.join(ROOT, 'views', 'dashboard.ejs'), 'utf8');

    assert.ok(!dashboard.includes('id="coursesGrid"'), 'the grid moved to the courses page');
    assert.ok(!dashboard.includes('id="courseModal"'), 'the modal moved to the courses page');
    assert.ok(dashboard.includes('href="/courses"'), 'the dashboard links to the courses');
});

/* ------------------------------------------------------------------ */
/* The admin pages                                                     */
/* ------------------------------------------------------------------ */

test('every admin button has its own page', async () => {
    const pages = ['/admin', '/admin/builder', '/admin/scores', '/admin/users', '/admin/settings', '/admin/account'];

    for (const page of pages) {
        const res = await fetch(base + page, { headers: { Cookie: cookie(ADMIN) }, redirect: 'manual' });
        assert.strictEqual(res.status, 200, page + ' should render');
    }
});

test('every admin panel is its own EJS file', () => {
    const panels = ['dashboard', 'builder', 'scores', 'users', 'settings', 'account'];

    panels.forEach((panel) => {
        const file = path.join(ROOT, 'views', 'admin', 'panels', panel + '.ejs');
        assert.ok(fs.existsSync(file), panel + '.ejs exists');
        assert.ok(fs.readFileSync(file, 'utf8').length > 50, panel + '.ejs has content');
    });

    const shell = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'adminportal.ejs'), 'utf8');
    assert.ok(shell.includes("'panels/' + tab + '.ejs'"), 'the shell shows the panel of the page');
    assert.ok(shell.includes("'messages'"), 'the message inbox is a panel of the shell too');
});

test('the admin navigation is made of real links', () => {
    const shell = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'adminportal.ejs'), 'utf8');

    ['/admin', '/admin/builder', '/admin/scores', '/admin/users', '/admin/settings', '/admin/messages', '/admin/account'].forEach(
        (link) => {
            assert.ok(shell.includes('href="' + link + '"'), link + ' is a link');
        }
    );

    assert.ok(!shell.includes("switchTab("), 'the old tab switcher is gone');
});

test('every admin page shows the shell and the section it is in', async () => {
    const sections = [
        ['/admin', 'Admin Overview'],
        ['/admin/builder', 'Exam &amp; Quiz Builder'],
        ['/admin/scores', 'Student Scores'],
        ['/admin/users', 'User Management'],
        ['/admin/messages', 'Student Messages'],
        ['/admin/settings', 'Platform Settings'],
        ['/admin/account', 'My Account'],
    ];

    for (const [page, title] of sections) {
        const res = await fetch(base + page, { headers: { Cookie: cookie(ADMIN) }, redirect: 'manual' });
        assert.strictEqual(res.status, 200, page + ' renders');

        const html = await res.text();
        assert.ok(html.includes('id="sidebar"'), page + ' has the sidebar');
        assert.ok(html.includes('>' + title + '<'), page + ' shows its title');
        assert.ok(html.includes('qn-sidebar-link is-active'), page + ' marks the active section');
        assert.ok(!html.includes('Rock Lee'), page + ' has no made up students');
    }

    // The search of the top bar is only there when the page has something
    // to search - the account page has not.
    const withSearch = await (await fetch(base + '/admin/users', { headers: { Cookie: cookie(ADMIN) } })).text();
    assert.ok(withSearch.includes('id="adminSearch"'), 'the pages with rows have the search');

    const withoutSearch = await (await fetch(base + '/admin/account', { headers: { Cookie: cookie(ADMIN) } })).text();
    assert.ok(!withoutSearch.includes('id="adminSearch"'), 'the account page has no search');
});

test('the builder does not show a second create button', async () => {
    const builder = await (await fetch(base + '/admin/builder', { headers: { Cookie: cookie(ADMIN) } })).text();

    // The panel has its own buttons - the top bar must not repeat them.
    assert.ok(!builder.includes('Create Assessment'), 'the top bar has no create button');
    assert.ok(builder.includes('id="builderNew"'), 'the builder has its own new button');
    assert.ok(builder.includes('id="builderPublish"'), 'the builder has its own publish button');
    assert.ok(builder.includes('id="builderSaveDraft"'), 'the builder has its own save button');
});

test('the account button of the portal is not there twice', async () => {
    const shell = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'adminportal.ejs'), 'utf8');

    const links = shell.split('href="/admin/account"').length - 1;
    assert.strictEqual(links, 1, 'the account page is linked once');

    assert.ok(!shell.includes('href="/settings"'), 'the sidebar does not link the student settings');
});

test('the search of the portal works on the rows of every page', async () => {
    const script = fs.readFileSync(path.join(ROOT, 'public', 'js', 'adminportal.js'), 'utf8');
    assert.ok(script.includes("QN.$$('[data-search]')"), 'the search looks at the rows of the page');
    assert.ok(script.includes('applyFilters'), 'the search and the role filter work together');

    const scores = await (await fetch(base + '/admin/scores', { headers: { Cookie: cookie(ADMIN) } })).text();
    assert.ok(scores.includes('data-search='), 'the scores are searchable');

    const users = await (await fetch(base + '/admin/users', { headers: { Cookie: cookie(ADMIN) } })).text();
    assert.ok(users.includes('data-search='), 'the users are searchable');
});

test('the admin data APIs need an administrator', async () => {
    const routes = ['/api/admin/overview', '/api/admin/users', '/api/admin/scores', '/api/admin/settings', '/api/admin/subjects'];

    for (const route of routes) {
        const res = await fetch(base + route, { headers: { Cookie: cookie(STUDENT) } });
        assert.strictEqual(res.status, 403, route + ' is for admins');
    }
});

/* ------------------------------------------------------------------ */
/* The account of the administrator                                    */
/* ------------------------------------------------------------------ */

test('the administrator has an account of its own', async () => {
    const res = await fetch(base + '/admin/account', { headers: { Cookie: cookie(ADMIN) }, redirect: 'manual' });
    const html = await res.text();

    assert.strictEqual(res.status, 200);

    // The identity of the administrator.
    assert.ok(html.includes('qn-account-hero'), 'the page has its own hero');
    assert.ok(html.includes('Shield') === false, 'the hero is drawn with an icon');
    assert.ok(html.includes('data-lucide="shield-check"'), 'the shield of the administrator is there');
    assert.ok(html.includes(ADMIN.email), 'the email of the administrator is there');

    // The snapshot of the platform.
    assert.ok(html.includes('qn-account-tile'), 'the tiles of the platform are there');
    assert.ok(html.includes('The last attempts'), 'the last attempts are there');
    assert.ok(html.includes('The latest messages'), 'the latest messages are there');

    // The account itself.
    assert.ok(html.includes('id="accountName"'), 'the name can be changed');
    assert.ok(html.includes('id="accountCurrentPassword"'), 'the password can be changed');
    assert.ok(html.includes('id="accountSavePreferences"'), 'the preferences can be saved');
    assert.ok(html.includes('/js/adminaccount.js'), 'the page has its own script');

    // It is nothing like the profile of the student.
    const student = await (await fetch(base + '/profile', { headers: { Cookie: cookie(STUDENT) } })).text();
    assert.ok(!student.includes('qn-account-hero'), 'the student profile is another page');
    assert.ok(!student.includes('id="accountName"'), 'the student profile has no admin form');
});

test('the account of the administrator saves the name', async () => {
    const res = await fetch(base + '/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie(ADMIN) },
        body: JSON.stringify({ fullName: ADMIN.name, subject: 'General' }),
    });

    assert.strictEqual(res.status, 200);
    const payload = await res.json();
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.user.full_name, ADMIN.name);
});

test('the admin overview holds the real numbers', async () => {
    const res = await fetch(base + '/api/admin/overview', { headers: { Cookie: cookie(ADMIN) } });
    const payload = await res.json();

    assert.strictEqual(payload.ok, true);
    assert.ok(typeof payload.stats.quizzes === 'number', 'the quizzes are counted');
    assert.ok(typeof payload.stats.students === 'number', 'the students are counted');
    assert.ok(typeof payload.stats.attempts === 'number', 'the attempts are counted');
    assert.ok(payload.stats.passingScore >= 0, 'the passing score is known');
});

test('the platform settings are stored and used', async () => {
    const saved = await (
        await fetch(base + '/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie(ADMIN) },
            body: JSON.stringify({ passing_score: 80 }),
        })
    ).json();

    assert.strictEqual(saved.ok, true);
    assert.strictEqual(saved.settings.passing_score, '80');

    // The attempt route uses it.
    const attempt = await (
        await fetch(base + '/api/attempts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
            body: JSON.stringify({ slug: 'rapidhunt-live-coding', answers: [], timeSpentSeconds: 10 }),
        })
    ).json();

    assert.strictEqual(attempt.passingScore, 80, 'the quiz uses the saved passing score');
    assert.strictEqual(attempt.passed, false, 'an empty attempt does not pass');

    // The test does not leave the attempt in the database.
    await db.execute('DELETE FROM attempts WHERE quiz_id = (SELECT id FROM quizzes WHERE slug = ?) AND user_id = ?', [
        'rapidhunt-live-coding',
        STUDENT.id,
    ]);

    // Put it back.
    await fetch(base + '/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie(ADMIN) },
        body: JSON.stringify({ passing_score: 60 }),
    });
});

test('a class can be created by a student', async () => {
    const code = 'TEST' + Date.now().toString(36).slice(-4).toUpperCase();

    const res = await fetch(base + '/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
        body: JSON.stringify({ code: code, title: 'Test Class', department: 'Testing' }),
    });

    const payload = await res.json();
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.class.code, code);

    // The same code cannot be used twice.
    const again = await fetch(base + '/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
        body: JSON.stringify({ code: code, title: 'Test Class', department: 'Testing' }),
    });
    assert.strictEqual(again.status, 409);

    // Clean up.
    await db.execute('DELETE FROM classes WHERE code = ?', [code]);
});

test('the class code is checked', async () => {
    const res = await fetch(base + '/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
        body: JSON.stringify({ code: 'a', title: '', department: '' }),
    });

    assert.strictEqual(res.status, 400);
    const payload = await res.json();
    assert.ok(payload.errors.code, 'the code is checked');
    assert.ok(payload.errors.title, 'the title is checked');
    assert.ok(payload.errors.department, 'the subject is checked');
});

test('no page is left with a dead button', () => {
    const files = [
        'views/dashboard.ejs',
        'views/classes.ejs',
        'views/assessment.ejs',
        'views/courses.ejs',
        'views/profile.ejs',
        'views/materials.ejs',
        'views/analytics.ejs',
        'views/messages.ejs',
        'views/community.ejs',
        'views/admin/adminportal.ejs',
    ];

    files.forEach((file) => {
        const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const dead = content.match(/showToast\(/g);
        assert.strictEqual(dead, null, file + ' has no placeholder button left');
    });
});
