'use strict';

/**
 * The exam builder: the admin creates an assessment, types the questions and
 * the answers, and the students can take the assessment afterwards.
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

const ADMIN = { id: 1, name: 'Charles Admin', email: 'admin@quiznova.edu', username: 'admin', role: 'admin' };
const STUDENT = { id: 2, name: 'Alex Morgan', email: 'alex.morgan@example.com', username: 'alex', role: 'student' };

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

async function api(pathname, options = {}) {
    const config = Object.assign({ headers: {} }, options);
    config.headers = Object.assign({ 'Content-Type': 'application/json' }, config.headers);

    const res = await fetch(base + pathname, config);
    const body = await res.json().catch(() => ({}));

    return { status: res.status, body };
}

/** Three questions that are ready to be published. */
function questions(count) {
    const list = [];

    for (let i = 1; i <= count; i += 1) {
        list.push({
            prompt: 'What is the answer of question ' + i + '?',
            options: ['First answer', 'Second answer', 'Third answer', 'Fourth answer', 'Fifth answer'],
            correct: 'B',
            points: 10,
        });
    }

    return list;
}

async function cleanup(quizId) {
    if (!quizId) return;
    await db.execute('DELETE FROM quizzes WHERE id = ?', [quizId]).catch(() => {});
}

/** Sets the number of questions of a subject. */
async function setSubjectCount(subject, count, optionCount = 4) {
    await api('/api/admin/subjects', {
        method: 'PUT',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ subject: subject, question_count: count, option_count: optionCount }),
    });
}

/* ------------------------------------------------------------------ */
/* The subjects                                                        */
/* ------------------------------------------------------------------ */

test('every subject has its settings', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const res = await api('/api/admin/subjects', { headers: { Cookie: cookieOf(ADMIN) } });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.subjects.length >= 30, 'every subject of the catalogue is there');

    const maths = res.body.subjects.find((item) => item.subject === 'Mathematics');
    assert.ok(maths, 'Mathematics is in the list');
    assert.ok(maths.question_count >= 1, 'the subject knows how many questions it gets');
    assert.ok(maths.option_count >= 2 && maths.option_count <= 5, 'the subject knows its answers');
});

test('the settings of a subject are saved', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const res = await api('/api/admin/subjects', {
        method: 'PUT',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            subject: 'Mathematics',
            question_count: 4,
            option_count: 5,
            duration_minutes: 25,
            points_per_question: 15,
        }),
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.subject.question_count, 4);
    assert.strictEqual(res.body.subject.option_count, 5);
    assert.strictEqual(res.body.subject.duration_minutes, 25);
    assert.strictEqual(res.body.subject.points_per_question, 15);

    // Put it back the way it was.
    await api('/api/admin/subjects', {
        method: 'PUT',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ subject: 'Mathematics', question_count: 10, option_count: 4, duration_minutes: 20, points_per_question: 10 }),
    });
});

test('a student may not change the settings', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const res = await api('/api/admin/subjects', {
        method: 'PUT',
        headers: { Cookie: cookieOf(STUDENT) },
        body: JSON.stringify({ subject: 'Mathematics', question_count: 99 }),
    });

    assert.strictEqual(res.status, 403);
});

/* ------------------------------------------------------------------ */
/* The assessments                                                     */
/* ------------------------------------------------------------------ */

test('the admin creates an assessment with its questions', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    await api('/api/admin/subjects', {
        method: 'PUT',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ subject: 'Mathematics', question_count: 3, option_count: 4 }),
    });

    const res = await api('/api/admin/quizzes', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            title: 'Builder Test Algebra',
            subject: 'Mathematics',
            type: 'QUIZ',
            status: 'DRAFT',
            duration: 30,
            questions: questions(3),
        }),
    });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.quiz.id, 'the assessment has an id');
    assert.strictEqual(res.body.quiz.slug, 'builder-test-algebra');
    assert.strictEqual(res.body.quiz.total_questions, 3);

    // The questions are really in the database.
    const stored = await db.query('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position ASC', [
        res.body.quiz.id,
    ]);

    assert.strictEqual(stored.length, 3, 'every question is saved');
    assert.strictEqual(stored[0].prompt, 'What is the answer of question 1?');
    assert.strictEqual(stored[0].correct_option, 'B');
    assert.strictEqual(stored[0].option_b, 'Second answer');

    // The builder reads it back.
    const one = await api('/api/admin/quizzes/' + res.body.quiz.id, { headers: { Cookie: cookieOf(ADMIN) } });
    assert.strictEqual(one.status, 200);
    assert.strictEqual(one.body.questions.length, 3);
    assert.strictEqual(one.body.questions[0].correct, 'B');

    await cleanup(res.body.quiz.id);

    await api('/api/admin/subjects', {
        method: 'PUT',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ subject: 'Mathematics', question_count: 10, option_count: 4 }),
    });
});

test('the number of questions follows the setting of the subject', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    await setSubjectCount('Mathematics', 3);

    // Two questions for a subject that wants three.
    const res = await api('/api/admin/quizzes', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            title: 'Builder Test Too Short',
            subject: 'Mathematics',
            status: 'IN_PROGRESS',
            questions: questions(2),
        }),
    });

    assert.strictEqual(res.status, 400, 'the assessment is refused');
    assert.ok(res.body.errors.questions.length, 'the admin gets a reason');
    assert.ok(
        res.body.errors.questions.join(' ').indexOf('3') > -1,
        'the message names the number of the subject'
    );

    await setSubjectCount('Mathematics', 10);
});

test('a question needs a question, two answers and the correct one', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    await setSubjectCount('Mathematics', 1);

    const res = await api('/api/admin/quizzes', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            title: 'Builder Test Broken',
            subject: 'Mathematics',
            status: 'IN_PROGRESS',
            questions: [{ prompt: 'Without an answer', options: ['', '', '', ''], correct: '' }],
        }),
    });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.errors.questions.length >= 2, 'the admin gets every reason');

    await setSubjectCount('Mathematics', 10);
});

test('a draft may be incomplete', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    await setSubjectCount('Mathematics', 2);

    const res = await api('/api/admin/quizzes', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            title: 'Builder Test Draft',
            subject: 'Mathematics',
            status: 'DRAFT',
            questions: [{ prompt: 'Only the first half', options: ['One', 'Two'], correct: 'A' }],
        }),
    });

    assert.strictEqual(res.status, 201, 'the draft is saved');
    assert.strictEqual(res.body.quiz.status, 'DRAFT');

    await cleanup(res.body.quiz.id);
    await setSubjectCount('Mathematics', 10);
});

test('the assessment is changed and removed again', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    await setSubjectCount('Mathematics', 2);

    const created = await api('/api/admin/quizzes', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            title: 'Builder Test Edit',
            subject: 'Mathematics',
            status: 'DRAFT',
            questions: questions(2),
        }),
    });

    assert.strictEqual(created.status, 201);
    const id = created.body.quiz.id;

    const updated = await api('/api/admin/quizzes/' + id, {
        method: 'PUT',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            title: 'Builder Test Edited',
            subject: 'Mathematics',
            status: 'IN_PROGRESS',
            duration: 45,
            questions: questions(2),
        }),
    });

    assert.strictEqual(updated.status, 200);
    assert.strictEqual(updated.body.quiz.title, 'Builder Test Edited');
    assert.strictEqual(updated.body.quiz.duration_minutes, 45);
    assert.strictEqual(updated.body.quiz.status, 'IN_PROGRESS');

    const removed = await api('/api/admin/quizzes/' + id, {
        method: 'DELETE',
        headers: { Cookie: cookieOf(ADMIN) },
    });

    assert.strictEqual(removed.status, 200);

    const gone = await db.one('SELECT id FROM quizzes WHERE id = ?', [id]);
    assert.strictEqual(gone, null, 'the assessment is gone');

    await setSubjectCount('Mathematics', 10);
});

test('a student may not touch the assessments of the admin', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const res = await api('/api/admin/quizzes', {
        method: 'POST',
        headers: { Cookie: cookieOf(STUDENT) },
        body: JSON.stringify({ title: 'Not allowed', subject: 'Mathematics' }),
    });

    assert.strictEqual(res.status, 403);
});

/* ------------------------------------------------------------------ */
/* The students                                                       */
/* ------------------------------------------------------------------ */

test('a published assessment is taken by a student', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    await setSubjectCount('Mathematics', 2);

    const created = await api('/api/admin/quizzes', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            title: 'Builder Test For The Students',
            subject: 'Mathematics',
            status: 'IN_PROGRESS',
            duration: 15,
            questions: [
                { prompt: 'Two plus two?', options: ['3', '4', '5', '6'], correct: 'B', points: 10 },
                { prompt: 'The capital of France?', options: ['Rome', 'Berlin', 'Paris', 'Madrid'], correct: 'C', points: 10 },
            ],
        }),
    });

    assert.strictEqual(created.status, 201);
    const slug = created.body.quiz.slug;

    // The student sees the assessment and its questions.
    const quiz = await api('/api/quiz/' + slug);
    assert.strictEqual(quiz.status, 200);
    assert.strictEqual(quiz.body.questions.length, 2);
    assert.strictEqual(quiz.body.questions[0].options.length, 4);
    assert.strictEqual(quiz.body.quiz.durationMinutes, 15);

    // The student answers it and the score is right.
    const attempt = await api('/api/attempts', {
        method: 'POST',
        headers: { Cookie: cookieOf(STUDENT) },
        body: JSON.stringify({
            slug: slug,
            answers: [
                { position: 1, option: 'B' },
                { position: 2, option: 'C' },
            ],
            timeSpentSeconds: 120,
        }),
    });

    assert.strictEqual(attempt.status, 200);
    assert.strictEqual(attempt.body.correct, 2);
    assert.strictEqual(attempt.body.total, 2);
    assert.strictEqual(attempt.body.score, 100);

    // The test does not leave the attempt in the database.
    await db.execute('DELETE FROM attempts WHERE quiz_id = ?', [created.body.quiz.id]);

    await cleanup(created.body.quiz.id);
    await setSubjectCount('Mathematics', 10);
});

test('a draft is not visible for the students', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    await setSubjectCount('Mathematics', 1);

    const created = await api('/api/admin/quizzes', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            title: 'Builder Test Hidden',
            subject: 'Mathematics',
            status: 'DRAFT',
            questions: questions(1),
        }),
    });

    const res = await api('/api/quiz/' + created.body.quiz.slug, { headers: { Cookie: cookieOf(STUDENT) } });
    assert.strictEqual(res.status, 404, 'the student does not see the draft');

    await cleanup(created.body.quiz.id);
    await setSubjectCount('Mathematics', 10);
});

/* ------------------------------------------------------------------ */
/* The pages                                                           */
/* ------------------------------------------------------------------ */

test('the builder page has the fields of the editor', async () => {
    const res = await fetch(base + '/admin/builder', { headers: { Cookie: cookieOf(ADMIN) } });
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.ok(html.includes('id="builderTitle"'), 'the title field is there');
    assert.ok(html.includes('id="builderQuestionCount"'), 'the number of questions is there');
    assert.ok(html.includes('id="builderOptionCount"'), 'the number of answers is there');
    assert.ok(html.includes('id="builderQuestions"'), 'the questions have a place');
    assert.ok(html.includes('/js/builder.js'), 'the script of the builder is loaded');
});

test('the builder shows one question and the next assessment', async () => {
    const fs = require('fs');

    const res = await fetch(base + '/admin/builder', { headers: { Cookie: cookieOf(ADMIN) } });
    const html = await res.text();

    // One question at a time.
    assert.ok(html.includes('id="builderPrevQuestion"'), 'the previous question is there');
    assert.ok(html.includes('id="builderNextQuestion"'), 'the next question is there');

    // The queue at the bottom of the page.
    assert.ok(html.includes('id="builderQueue"'), 'the queue is shown');
    assert.ok(html.includes('id="builderNextName"'), 'the next assessment is named');
    assert.ok(html.includes('id="builderNextAssessment"'), 'the next assessment has a button');

    // The script walks the questions and the queue.
    const script = fs.readFileSync(path.join(ROOT, 'public', 'js', 'builder.js'), 'utf8');
    assert.ok(script.includes('function nextAssessment'), 'the script knows the next assessment');
    assert.ok(script.includes('function renderQuestion'), 'the script draws a single question');
});

test('every field of the builder script is on the page', async () => {
    const fs = require('fs');
    const res = await fetch(base + '/admin/builder', { headers: { Cookie: cookieOf(ADMIN) } });
    const html = await res.text();

    const script = fs.readFileSync(path.join(ROOT, 'public', 'js', 'builder.js'), 'utf8');
    const ids = [];
    const pattern = /field\('([a-zA-Z]+)'\)/g;

    let match = pattern.exec(script);
    while (match) {
        if (ids.indexOf(match[1]) === -1) ids.push(match[1]);
        match = pattern.exec(script);
    }

    assert.ok(ids.length > 5, 'the script uses a couple of fields');

    ids.forEach((id) => {
        assert.ok(html.includes('id="' + id + '"'), 'the page has the field ' + id);
    });
});

test('the assessment page shows the assessments of the database', async () => {
    const res = await fetch(base + '/assessment');
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.ok(html.includes('id="assessmentsContainer"'), 'the cards have a place');
});
