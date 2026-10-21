'use strict';

/**
 * The student progress page (/profile).
 *
 * The mastery map is built from the attempts of the signed-in student.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const progress = require(path.join(ROOT, 'data', 'progress'));

const auth = require(path.join(ROOT, 'middleware', 'auth'));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function attempt(daysAgo, title, subject, score) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(10, 0, 0, 0);

    return {
        title: title,
        subject: subject,
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        score: score,
        correct_count: Math.round((score / 100) * 20),
        total_questions: 20,
        time_spent_seconds: 900,
        submitted_at: date.toISOString().slice(0, 19).replace('T', ' '),
    };
}

const ATTEMPTS = [
    attempt(6, 'Midterm Exam: Derivatives & Integrals', 'Mathematics', 90),
    attempt(5, 'Quiz #4: Async JS & Promises', 'Computer Science', 70),
    attempt(4, 'Quantum Wave Equations Quiz', 'Physics', 40),
    attempt(2, 'Literature Essay: Modernism Analysis', 'English', 95),
    attempt(0, 'UI Color Theory & Gradients Test', 'Graphic Design', 60),
];

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

test('the progress model groups the attempts per subject', () => {
    const model = progress.buildProgress(ATTEMPTS, ['Mathematics', 'English']);

    const names = model.subjects.map((subject) => subject.name);
    assert.ok(names.includes('Mathematics'));
    assert.ok(names.includes('English'));
    assert.ok(names.includes('Computer Science'));

    const english = model.subjects.find((subject) => subject.name === 'English');
    assert.strictEqual(english.score, 95);
    assert.ok(english.icon, 'every subject gets an icon');
    assert.ok(english.color, 'every subject gets a colour');
});

test('the progress model splits the strengths from the topics to revise', () => {
    const model = progress.buildProgress(ATTEMPTS, []);

    assert.strictEqual(model.strengths.length, 3);
    assert.strictEqual(model.strengths[0].value, 95, 'the best topic comes first');

    assert.ok(model.attention.length > 0);
    assert.ok(
        model.attention.every((topic) => topic.value <= 70),
        'the topics to revise are the weak ones'
    );
});

test('the topic names are shortened', () => {
    assert.strictEqual(progress.shortTitle('Midterm Exam: Derivatives & Integrals'), 'Derivatives & Integrals');
    assert.strictEqual(progress.shortTitle('Quiz #4: Async JS & Promises'), 'Async JS & Promises');
    assert.strictEqual(progress.shortTitle('RAPIDHUNT - Live Coding Assessment').length, 26);
});

test('the progress model counts the quizzes, the points and the accuracy', () => {
    const model = progress.buildProgress(ATTEMPTS, []);

    assert.strictEqual(model.quizzes, 5);
    assert.strictEqual(model.accuracy, 71, '15 correct out of 21 questions');
    assert.strictEqual(model.totalSeconds, 4500);
    assert.strictEqual(model.hours, 1);
    assert.strictEqual(model.minutes, 15);
    assert.ok(model.points > 0);
    assert.ok(model.level >= 1);
});

test('the progress model counts the streak of the last days', () => {
    const model = progress.buildProgress(ATTEMPTS, []);

    // Attempts on day 0, 2, 4, 5 and 6 -> today, then yesterday is empty.
    assert.strictEqual(model.streak, 1);
});

test('the 7 day trend has one point per day', () => {
    const model = progress.buildProgress(ATTEMPTS, []);

    assert.strictEqual(model.trend.points.length, 7);
    assert.strictEqual(model.trend.points[6].value, 60, 'today carries the last score');
    assert.ok(model.trend.line.startsWith('M'), 'the trend is a path');
    assert.ok(model.trend.area.endsWith('Z'), 'the trend has an area');
});

test('the radar chart has a ring, a polygon and a label per subject', () => {
    const model = progress.buildProgress(ATTEMPTS, []);

    assert.strictEqual(model.radar.rings.length, 4);
    assert.strictEqual(model.radar.polygon.length, model.subjects.length);
    assert.strictEqual(model.radar.labels.length, model.subjects.length);
    assert.ok(model.radar.polygonPoints.includes(','), 'the polygon has points');
});

test('an account without attempts gets an empty but valid model', () => {
    const model = progress.buildProgress([], ['Mathematics']);

    assert.strictEqual(model.hasData, false);
    assert.strictEqual(model.quizzes, 0);
    assert.strictEqual(model.level, 1);
    assert.strictEqual(model.subjects.length, 1, 'the available subjects are still listed');
    assert.strictEqual(model.subjects[0].score, 0);
    assert.strictEqual(model.trend.points.length, 7);
});

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

test('the profile page is linked from the student sidebars', () => {
    ['dashboard.ejs', 'classes.ejs', 'assessment.ejs'].forEach((file) => {
        const content = fs.readFileSync(path.join(ROOT, 'views', file), 'utf8');
        assert.ok(content.includes('href="/profile"'), file + ' links to the profile');
        assert.ok(content.includes('hover:bg-hoverBg'), file + ' highlights the box on hover');
        assert.ok(content.includes('group-hover:text-brand-300'), file + ' highlights the name on hover');
    });
});

test('the profile page renders the mastery map', () => {
    const content = fs.readFileSync(path.join(ROOT, 'views', 'profile.ejs'), 'utf8');

    assert.ok(content.includes('qn-radar-area'), 'the radar chart is there');
    assert.ok(content.includes('qn-radar-label'), 'the subject bubbles are there');
    assert.ok(content.includes('qn-trend-line'), 'the 7 day trend is there');
    assert.ok(content.includes('Top Strengths'), 'the strengths are listed');
    assert.ok(content.includes('Needs Attention'), 'the topics to revise are listed');
    assert.ok(content.includes('data-theme-toggle'), 'the page has the theme toggle');
});

test('the profile page needs a session', async () => {
    const app = require(path.join(ROOT, 'app'));
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        const res = await fetch(base + '/profile', { redirect: 'manual' });
        assert.strictEqual(res.status, 302);
        assert.strictEqual(res.headers.get('location'), '/accsetup?next=%2Fprofile');

        // Signed in, the page renders.
        const token = auth.encodeSession({
            uid: 2,
            name: 'Alex Morgan',
            email: 'alex.morgan@example.com',
            username: 'alex',
            role: 'student',
            exp: Date.now() + 60000,
        });

        const page = await fetch(base + '/profile', {
            headers: { Cookie: `qn_session=${token}` },
        });
        assert.strictEqual(page.status, 200);
        const html = await page.text();
        assert.ok(html.includes('qn-radar-area'), 'the chart is rendered');
        assert.ok(html.includes('Alex Morgan'), 'the student is greeted');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        await require(path.join(ROOT, 'conn')).close().catch(() => {});
    }
});
