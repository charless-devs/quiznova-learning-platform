'use strict';

/**
 * The student settings, the light mode text and the real dates.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const app = require(path.join(ROOT, 'app'));
const auth = require(path.join(ROOT, 'middleware', 'auth'));
const dates = require(path.join(ROOT, 'utils', 'dates'));
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
/* The dates                                                           */
/* ------------------------------------------------------------------ */

test('the date helpers use the real day', () => {
    const now = new Date();

    assert.strictEqual(dates.shortDate(now), now.getDate() + ' OCT');
    assert.ok(dates.longDate(now).includes(String(now.getFullYear())));
    assert.ok(dates.todayLabel(now).startsWith('Today, '));
    assert.strictEqual(dates.todayLabel(now), 'Today, ' + dates.shortDate(now));
});

test('the week strip starts today and counts on', () => {
    const strip = dates.weekStrip(6);
    const now = new Date();

    assert.strictEqual(strip.length, 6);
    assert.strictEqual(strip[0].isToday, true);
    assert.strictEqual(strip[0].day, now.getDate());

    const tomorrow = new Date(now.getTime());
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.strictEqual(strip[1].day, tomorrow.getDate());
});

test('no page shows a date that was typed in once', () => {
    const files = [
        'views/dashboard.ejs',
        'views/admin/panels/dashboard.ejs',
        'views/admin/panels/builder.ejs',
    ];

    files.forEach((file) => {
        const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.ok(!content.includes('MAY 24'), file + ' has no hard coded May date');
        assert.ok(!content.includes('Oct 20, 2026'), file + ' has no hard coded date');
    });
});

test('the dashboard shows the real week', async () => {
    // The chart of the dashboard shows the last seven days - with their real
    // date. A student with quizzes is needed for the chart to be there.
    const html = await (
        await fetch(base + '/dashboard', { headers: { Cookie: cookie(STUDENT) } })
    ).text();

    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        days.push(dates.MONTHS[date.getMonth()] + ' ' + date.getDate());
    }

    days.forEach((label) => {
        assert.ok(html.includes(label), 'the chart shows ' + label);
    });

    assert.ok(html.includes(dates.todayLabel(new Date())), 'the timeline shows today');
});

test('the chart of the dashboard shows the real scores', async () => {
    const html = await (
        await fetch(base + '/dashboard', { headers: { Cookie: cookie(STUDENT) } })
    ).text();

    // The legend tells what the two lines are.
    assert.ok(html.includes('The score'), 'the chart says what the first line is');
    assert.ok(html.includes('The correct answers'), 'the chart says what the second line is');

    // The old labels of the design are gone.
    assert.ok(!html.includes('>Reading<'), 'the chart has no reading line');
    assert.ok(!html.includes('>Listening<'), 'the chart has no listening line');

    // The points of the chart come from the attempts of the student.
    const progress = require(path.join(ROOT, 'data', 'progress'));
    const model = progress.buildProgress([
        {
            title: 'A quiz',
            subject: 'Mathematics',
            slug: 'a-quiz',
            score: 80,
            correct_count: 4,
            total_questions: 5,
            time_spent_seconds: 120,
            submitted_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        },
    ]);

    assert.strictEqual(model.week.points.length, 7, 'the chart has seven days');
    assert.strictEqual(model.week.points[6].value, 80, 'the last day holds the score');
    assert.strictEqual(model.week.points[6].accuracy, 80, 'the last day holds the correct answers');
    assert.ok(model.week.scoreLine.length > 0, 'the chart has a line');
    assert.ok(model.week.accuracyLine.length > 0, 'the chart has a second line');
});

/* ------------------------------------------------------------------ */
/* The light mode                                                      */
/* ------------------------------------------------------------------ */

test('the message bubbles are readable in the light theme', () => {
    const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'messages.css'), 'utf8');

    assert.ok(css.includes('html.light .qn-bubble.is-incoming'), 'the incoming bubble has a light colour');
    assert.ok(css.includes('color: #0f172a'), 'the text of the bubble is dark in the light theme');
});

test('the dark theme of the bubbles is untouched', () => {
    const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'messages.css'), 'utf8');

    const dark = /\.qn-bubble\.is-incoming \{[^}]*color: #e2e8f0;/.test(css);
    assert.ok(dark, 'the dark theme still uses the light text');
});

/* ------------------------------------------------------------------ */
/* The settings page                                                   */
/* ------------------------------------------------------------------ */

test('the settings page needs a session', async () => {
    const res = await fetch(base + '/settings', { redirect: 'manual' });
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get('location'), '/accsetup?next=%2Fsettings');
});

test('the settings page has the profile, the preferences and the password', async () => {
    const res = await fetch(base + '/settings', { headers: { Cookie: cookie(STUDENT) } });
    assert.strictEqual(res.status, 200);

    const html = await res.text();
    assert.ok(html.includes('id="settingName"'), 'the name can be changed');
    assert.ok(html.includes('id="settingSubject"'), 'the subject can be changed');
    assert.ok(html.includes('data-preference="quiz_sound"'), 'the preferences have switches');
    assert.ok(html.includes('id="settingDailyGoal"'), 'the daily goal can be set');
    assert.ok(html.includes('id="currentPassword"'), 'the password can be changed');
    assert.ok(html.includes('/js/settings.js'), 'the page has its own script');
});

test('the profile of a student can be saved', async () => {
    const res = await fetch(base + '/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
        body: JSON.stringify({ fullName: 'Alex Morgan', subject: 'Computer Science' }),
    });

    const payload = await res.json();
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.user.full_name, 'Alex Morgan');
    assert.strictEqual(payload.user.subject, 'Computer Science');
});

test('the preferences are stored and read back', async () => {
    const saved = await (
        await fetch(base + '/api/profile/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
            body: JSON.stringify({ theme: 'light', daily_goal: 7, quiz_sound: 0 }),
        })
    ).json();

    assert.strictEqual(saved.ok, true);
    assert.strictEqual(saved.preferences.theme, 'light');
    assert.strictEqual(saved.preferences.daily_goal, 7);

    const read = await (
        await fetch(base + '/api/profile/preferences', { headers: { Cookie: cookie(STUDENT) } })
    ).json();
    assert.strictEqual(read.preferences.daily_goal, 7);
    assert.strictEqual(read.preferences.quiz_sound, 0);

    // The test puts the preferences of the student back the way they were.
    await fetch(base + '/api/profile/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
        body: JSON.stringify({ theme: 'dark', daily_goal: 5, quiz_sound: 1 }),
    });
});

test('the password can only be changed with the right old one', async () => {
    const wrong = await (
        await fetch(base + '/api/auth/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie(STUDENT) },
            body: JSON.stringify({ currentPassword: 'not-my-password', newPassword: 'anotherpass1' }),
        })
    ).json();

    assert.strictEqual(wrong.ok, false);
    assert.ok(wrong.errors.currentPassword, 'the current password is checked');
});

test('the settings link leads to the settings page', () => {
    ['dashboard.ejs', 'classes.ejs', 'assessment.ejs'].forEach((file) => {
        const content = fs.readFileSync(path.join(ROOT, 'views', file), 'utf8');
        assert.ok(content.includes('href="/settings"'), file + ' links to the settings');
    });
});
