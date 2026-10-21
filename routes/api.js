'use strict';

/**
 * QuizNova - data API.
 *   GET  /api/classes
 *   POST /api/classes/join
 *   GET  /api/assessments
 *   GET  /api/quiz/:slug
 *   POST /api/attempts
 *   GET  /api/stats
 */

const express = require('express');

const db = require('../conn');
const bank = require('../data/questionBank');
const progressData = require('../data/progress');
const realtime = require('../utils/realtime');
const settings = require('../utils/settings');
const subjectSettings = require('../utils/subjectSettings');
const quizBuilder = require('../utils/quizBuilder');
const uploads = require('../utils/uploads');
const subjects = require('../data/subjects');
const { requireAuth, requireAdmin, startSession, isSecureRequest } = require('../middleware/auth');

const router = express.Router();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function rowToQuestion(row) {
    // The answers are stored in the order A, B, C ... so the empty ones at
    // the end are dropped - the letters of the answers stay the same.
    const options = [row.option_a, row.option_b, row.option_c, row.option_d, row.option_e].map(function (value) {
        return value === null || value === undefined ? '' : value;
    });

    while (options.length > 2 && !options[options.length - 1]) options.pop();

    return {
        id: row.position,
        prompt: row.prompt,
        code: row.code_snippet || null,
        options: options,
        correct: row.correct_option,
        points: Number(row.points) || 10,
        type: row.question_type || 'MCQ',
        explanation: row.explanation || '',
    };
}

function bundledQuiz(slug) {
    if (slug === 'rapidhunt-live-coding') {
        return {
            quiz: {
                slug,
                title: 'RAPIDHUNT - Live Coding Assessment',
                subject: 'C Programming',
                durationMinutes: 30,
            },
            questions: bank.rapidhunt,
        };
    }

    const assessment = bank.assessments.find((item) => item.slug === slug);
    if (assessment) {
        return {
            quiz: {
                slug: assessment.slug,
                title: assessment.title,
                subject: assessment.subject,
                durationMinutes: assessment.durationMinutes,
            },
            questions: assessment.questions,
        };
    }

    return null;
}

/* ------------------------------------------------------------------ */
/* Classes                                                             */
/* ------------------------------------------------------------------ */

router.get('/classes', async (req, res) => {
    const userId = req.user ? req.user.uid : 0;

    try {
        const rows = await db.query(
            `SELECT c.id, c.code, c.title, c.department, c.instructor, c.status, c.is_live,
                    c.description, c.schedule,
                    (cm.user_id IS NOT NULL) AS enrolled
             FROM classes c
             LEFT JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = ?
             ORDER BY c.is_live DESC, c.code ASC`,
            [userId]
        );
        return res.json({ ok: true, classes: rows, source: 'db' });
    } catch (err) {
        return res.json({
            ok: true,
            source: 'bundled',
            classes: bank.classes.map((item) => ({ ...item, enrolled: 0 })),
        });
    }
});

router.post('/classes', requireAuth, async (req, res) => {
    const code = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const department = typeof req.body.department === 'string' ? req.body.department.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    const schedule = typeof req.body.schedule === 'string' ? req.body.schedule.trim() : '';

    const errors = {};
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) errors.code = 'Use 3 to 20 letters, numbers or dashes.';
    if (!title) errors.title = 'A title is required.';
    if (!department) errors.department = 'A subject is required.';

    if (Object.keys(errors).length) {
        return res.status(400).json({ ok: false, error: 'Please check the highlighted fields.', errors: errors });
    }

    try {
        const existing = await db.one('SELECT id FROM classes WHERE code = ? LIMIT 1', [code]);
        if (existing) {
            return res.status(409).json({
                ok: false,
                error: 'That class code is taken.',
                errors: { code: 'Pick another code.' },
            });
        }

        const result = await db.execute(
            `INSERT INTO classes (code, title, department, instructor, status, is_live, description, schedule)
             VALUES (?, ?, ?, ?, 'ACTIVE', 0, ?, ?)`,
            [code, title, department, req.user.name || 'QuizNova', description || null, schedule || null]
        );

        // The creator is a member of their own class.
        await db.execute('INSERT IGNORE INTO class_members (class_id, user_id) VALUES (?, ?)', [
            result.insertId,
            req.user.uid,
        ]);

        const klass = await db.one(
            'SELECT id, code, title, department, instructor, status, is_live, description, schedule FROM classes WHERE id = ?',
            [result.insertId]
        );

        return res.status(201).json({ ok: true, message: 'Class [' + code + '] created.', class: klass });
    } catch (err) {
        console.error('[classes] could not create the class:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not create the class.' });
    }
});

router.post('/classes/join', requireAuth, async (req, res) => {
    const code = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';

    if (!code) {
        return res.status(400).json({ ok: false, error: 'Enter a class code.' });
    }

    try {
        const klass = await db.one('SELECT id, code, title FROM classes WHERE code = ? LIMIT 1', [code]);
        if (!klass) {
            return res.status(404).json({ ok: false, error: `No class found with the code ${code}.` });
        }

        await db.execute(
            'INSERT IGNORE INTO class_members (class_id, user_id) VALUES (?, ?)',
            [klass.id, req.user.uid]
        );

        return res.json({ ok: true, message: `Successfully enrolled in class [${code}]!`, class: klass });
    } catch (err) {
        return res.status(503).json({ ok: false, error: err.message || 'Could not join the class right now.' });
    }
});

/* ------------------------------------------------------------------ */
/* Assessments                                                         */
/* ------------------------------------------------------------------ */

router.get('/assessments', async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT q.slug, q.title, q.subject, q.type, q.status, q.duration_minutes, q.total_questions,
                    q.points_per_question, q.published_at, c.code AS class_code
             FROM quizzes q
             LEFT JOIN classes c ON c.id = q.class_id
             WHERE q.slug <> 'rapidhunt-live-coding'
               AND q.status <> 'DRAFT'
               AND (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = q.id) > 0
             ORDER BY q.id ASC`
        );
        return res.json({ ok: true, source: 'db', assessments: rows });
    } catch {
        return res.json({
            ok: true,
            source: 'bundled',
            assessments: bank.assessments.map((item) => ({
                slug: item.slug,
                title: item.title,
                subject: item.subject,
                type: item.type,
                status: item.status,
                duration_minutes: item.durationMinutes,
                total_questions: item.questions.length,
                points_per_question: 10,
                class_code: item.classCode,
            })),
        });
    }
});

/* ------------------------------------------------------------------ */
/* Quiz content                                                        */
/* ------------------------------------------------------------------ */

router.get('/quiz/:slug', async (req, res) => {
    const { slug } = req.params;

    try {
        const quiz = await db.one('SELECT * FROM quizzes WHERE slug = ? LIMIT 1', [slug]);
        if (quiz) {
            // A draft belongs to the admin - the students do not see it.
            const isAdmin = !!(req.user && req.user.role === 'admin');
            if (quiz.status === 'DRAFT' && !isAdmin) {
                return res.status(404).json({ ok: false, error: 'Quiz not found.' });
            }

            const rows = await db.query(
                'SELECT * FROM questions WHERE quiz_id = ? ORDER BY position ASC',
                [quiz.id]
            );
            return res.json({
                ok: true,
                source: 'db',
                quiz: {
                    slug: quiz.slug,
                    title: quiz.title,
                    subject: quiz.subject,
                    durationMinutes: quiz.duration_minutes,
                },
                questions: rows.map(rowToQuestion),
            });
        }
    } catch (err) {
        console.warn('[api] quiz lookup failed, using bundled data:', err.message);
    }

    const fallback = bundledQuiz(slug);
    if (!fallback) {
        return res.status(404).json({ ok: false, error: 'Quiz not found.' });
    }

    return res.json({ ok: true, source: 'bundled', quiz: fallback.quiz, questions: fallback.questions });
});

/* ------------------------------------------------------------------ */
/* Attempts                                                            */
/* ------------------------------------------------------------------ */

router.post('/attempts', requireAuth, async (req, res) => {
    const slug = typeof req.body.slug === 'string' ? req.body.slug.trim() : '';
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const timeSpentSeconds = Number(req.body.timeSpentSeconds) || 0;

    if (!slug) {
        return res.status(400).json({ ok: false, error: 'Missing quiz reference.' });
    }

    try {
        const quiz = await db.one('SELECT id, total_questions FROM quizzes WHERE slug = ? LIMIT 1', [slug]);
        if (!quiz) {
            return res.status(404).json({ ok: false, error: 'That quiz is not available.' });
        }

        const rows = await db.query(
            'SELECT position, correct_option FROM questions WHERE quiz_id = ? ORDER BY position ASC',
            [quiz.id]
        );

        let correct = 0;
        answers.forEach((answer) => {
            const position = Number(answer.position ?? answer.id);
            const expected = rows.find((row) => row.position === position);
            if (expected && expected.correct_option === answer.option) correct += 1;
        });

        const total = rows.length;
        const score = total ? (correct / total) * 100 : 0;
        const passingScore = await settings.readNumber(db, 'passing_score');

        await db.execute(
            `INSERT INTO attempts (user_id, quiz_id, score, correct_count, total_questions, answers, time_spent_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.uid,
                quiz.id,
                score.toFixed(2),
                correct,
                total,
                JSON.stringify(answers),
                Math.max(0, Math.round(timeSpentSeconds)),
            ]
        );

        // The progress of the student is up to date.
        realtime.publish(
            'stats:updated',
            { quiz: slug, score: Number(score.toFixed(2)), correct: correct, total: total },
            function (user) {
                return user.uid === req.user.uid;
            }
        );

        return res.json({
            ok: true,
            score: Number(score.toFixed(2)),
            correct,
            total,
            passed: score >= passingScore,
            passingScore: passingScore,
        });
    } catch (err) {
        return res.status(503).json({ ok: false, error: err.message || 'Could not save your attempt.' });
    }
});

/* ------------------------------------------------------------------ */
/* The admin data                                                      */
/* ------------------------------------------------------------------ */

/** The numbers of the admin overview. */
async function loadOverview(db) {
    const [quizzes, students, attempts, messages, passingScore] = await Promise.all([
        db.one('SELECT COUNT(*) AS total FROM quizzes'),
        db.one("SELECT COUNT(*) AS total FROM users WHERE role = 'student'"),
        db.one('SELECT COUNT(*) AS total, AVG(score) AS average FROM attempts'),
        db.one("SELECT COUNT(*) AS total FROM messages WHERE status = 'open'"),
        settings.readNumber(db, 'passing_score'),
    ]);

    const totalAttempts = Number(attempts.total) || 0;
    let passed = 0;

    if (totalAttempts) {
        const rows = await db.query('SELECT score FROM attempts');
        passed = rows.filter((row) => Number(row.score) >= passingScore).length;
    }

    return {
        quizzes: Number(quizzes.total) || 0,
        students: Number(students.total) || 0,
        attempts: totalAttempts,
        average: Math.round(Number(attempts.average) || 0),
        openMessages: Number(messages.total) || 0,
        passingScore: passingScore,
        passRate: totalAttempts ? Math.round((passed / totalAttempts) * 100) : 0,
    };
}

/** Every user with what they have done. */
async function loadUsers(db) {
    const rows = await db.query(
        `SELECT u.id, u.full_name, u.username, u.email, u.role, u.subject, u.created_at,
                COUNT(a.id) AS attempts,
                COALESCE(ROUND(AVG(a.score)), 0) AS average
         FROM users u
         LEFT JOIN attempts a ON a.user_id = u.id
         GROUP BY u.id
         ORDER BY u.created_at ASC`
    );

    return rows;
}

/** Every attempt with the student and the quiz. */
async function loadScores(db) {
    const rows = await db.query(
        `SELECT a.id, a.score, a.correct_count, a.total_questions, a.time_spent_seconds, a.submitted_at,
                u.id AS user_id, u.full_name, u.username, u.email,
                q.id AS quiz_id, q.title, q.subject
         FROM attempts a
         JOIN users u ON u.id = a.user_id
         JOIN quizzes q ON q.id = a.quiz_id
         ORDER BY a.submitted_at DESC`
    );

    return rows;
}

/** Every quiz of the platform (optionally only of one subject). */
async function loadQuizzes(db, subject) {
    const where = subject ? 'WHERE q.subject = ?' : '';
    const params = subject ? [subject] : [];

    const rows = await db.query(
        `SELECT q.id, q.slug, q.title, q.subject, q.type, q.status, q.duration_minutes, q.total_questions,
                q.points_per_question, q.created_at, q.published_at,
                (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = q.id) AS question_count,
                c.code AS class_code
         FROM quizzes q
         LEFT JOIN classes c ON c.id = q.class_id
         ${where}
         ORDER BY q.id ASC`,
        params
    );

    return rows;
}

/* ------------------------------------------------------------------ */
/* The exam builder                                                    */
/* ------------------------------------------------------------------ */

/** A slug that no other assessment uses yet. */
async function uniqueSlug(db, title, currentId) {
    const base =
        String(title || 'assessment')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || 'assessment';

    let slug = base;
    let counter = 2;

    for (let tries = 0; tries < 50; tries += 1) {
        const row = await db.one('SELECT id FROM quizzes WHERE slug = ? LIMIT 1', [slug]);
        if (!row || (currentId && Number(row.id) === Number(currentId))) return slug;

        slug = base + '-' + counter;
        counter += 1;
    }

    return base + '-' + Date.now().toString(36);
}

/** The values of an assessment that the admin sends. */
function readQuizInput(body) {
    const text = function (value) {
        return typeof value === 'string' ? value.trim() : '';
    };

    const types = ['QUIZ', 'ASSIGNMENT', 'MIDTERM', 'MOCK'];
    const statuses = ['DRAFT', 'UPCOMING', 'IN_PROGRESS', 'COMPLETED'];

    return {
        title: text(body.title).slice(0, 160),
        subject: text(body.subject).slice(0, 80),
        type: types.indexOf(body.type) > -1 ? body.type : 'QUIZ',
        status: statuses.indexOf(body.status) > -1 ? body.status : 'DRAFT',
        duration: Number(body.duration) || 0,
        instructions: text(body.instructions).slice(0, 2000),
    };
}

/**
 * The settings of a subject (how many questions it gets, how many answers a
 * question has, ...) - the builder follows them.
 */
router.get('/admin/subjects', requireAdmin, async (req, res) => {
    try {
        const stored = await subjectSettings.readAll(db);
        const counts = await db.query('SELECT subject, COUNT(*) AS total FROM quizzes GROUP BY subject');

        const list = subjects.SUBJECTS.map(function (subject) {
            const row = stored[subject.name] || subjectSettings.defaults();
            const count = counts.find(function (item) {
                return item.subject === subject.name;
            });

            return {
                subject: subject.name,
                icon: subject.icon,
                color: subject.color,
                group: subject.group,
                question_count: row.question_count,
                option_count: row.option_count,
                duration_minutes: row.duration_minutes,
                points_per_question: row.points_per_question,
                quizzes: count ? Number(count.total) : 0,
            };
        });

        return res.json({ ok: true, subjects: list });
    } catch (err) {
        console.error('[admin] could not load the subjects:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load the subjects.' });
    }
});

/** Saves the settings of a subject (the number of questions it gets). */
router.put('/admin/subjects', requireAdmin, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 80) : '';

    if (!subject) {
        return res.status(400).json({ ok: false, error: 'A subject is required.', errors: { subject: 'A subject is required.' } });
    }

    try {
        const saved = await subjectSettings.write(db, subject, {
            question_count: body.question_count,
            option_count: body.option_count,
            duration_minutes: body.duration_minutes,
            points_per_question: body.points_per_question,
        });

        return res.json({ ok: true, subject: saved });
    } catch (err) {
        console.error('[admin] could not save the subject:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not save the subject.' });
    }
});

router.get('/admin/quizzes', requireAdmin, async (req, res) => {
    try {
        const subject = typeof req.query.subject === 'string' ? req.query.subject.trim() : '';
        return res.json({ ok: true, quizzes: await loadQuizzes(db, subject) });
    } catch (err) {
        console.error('[admin] could not load the quizzes:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load the quizzes.' });
    }
});

/** One assessment with its questions - the builder loads it to edit it. */
router.get('/admin/quizzes/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'That assessment does not exist.' });
    }

    try {
        const quiz = await db.one('SELECT * FROM quizzes WHERE id = ? LIMIT 1', [id]);
        if (!quiz) {
            return res.status(404).json({ ok: false, error: 'That assessment does not exist.' });
        }

        const rows = await db.query('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position ASC', [id]);

        return res.json({ ok: true, quiz: quiz, questions: rows.map(quizBuilder.fromRow) });
    } catch (err) {
        console.error('[admin] could not load the assessment:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load the assessment.' });
    }
});

/** Creates an assessment with its questions. */
router.post('/admin/quizzes', requireAdmin, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const input = readQuizInput(body);

    const errors = {};
    if (!input.title) errors.title = 'A title is required.';
    if (!input.subject) errors.subject = 'A subject is required.';

    // The number of questions follows the setting of the subject - the
    // server is the one that decides, not the browser.
    const subjectConfig = input.subject ? await subjectSettings.read(db, input.subject) : subjectSettings.defaults();
    const expected = subjectConfig.question_count;

    const check = quizBuilder.validate(quizBuilder.normalise(body.questions), {
        strict: input.status !== 'DRAFT',
        expectedCount: expected,
    });

    if (check.errors.length) errors.questions = check.errors;

    if (Object.keys(errors).length) {
        return res.status(400).json({ ok: false, error: 'Please check the highlighted fields.', errors: errors });
    }

    try {
        const slug = await uniqueSlug(db, input.title);
        const duration = Math.max(1, Math.min(240, input.duration || subjectConfig.duration_minutes));

        const quizId = await db.transaction(async function (tx) {
            const result = await tx.execute(
                `INSERT INTO quizzes (slug, title, subject, type, status, duration_minutes, total_questions,
                        points_per_question, instructions, created_by, published_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    slug,
                    input.title,
                    input.subject,
                    input.type,
                    input.status,
                    duration,
                    check.questions.length,
                    subjectConfig.points_per_question,
                    input.instructions || null,
                    req.user.uid,
                    input.status === 'DRAFT' ? null : new Date(),
                ]
            );

            await writeQuestions(tx, result.insertId, check.questions);

            return result.insertId;
        });

        const quiz = await db.one('SELECT * FROM quizzes WHERE id = ?', [quizId]);

        return res.status(201).json({ ok: true, quiz: quiz, questions: check.questions });
    } catch (err) {
        console.error('[admin] could not create the assessment:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not create the assessment.' });
    }
});

/** Changes an assessment and its questions. */
router.put('/admin/quizzes/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const input = readQuizInput(body);

    if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'That assessment does not exist.' });
    }

    const errors = {};
    if (!input.title) errors.title = 'A title is required.';
    if (!input.subject) errors.subject = 'A subject is required.';

    try {
        const current = await db.one('SELECT * FROM quizzes WHERE id = ? LIMIT 1', [id]);
        if (!current) {
            return res.status(404).json({ ok: false, error: 'That assessment does not exist.' });
        }

        const subjectConfig = await subjectSettings.read(db, input.subject || current.subject);
        const expected = subjectConfig.question_count;

        const check = quizBuilder.validate(quizBuilder.normalise(body.questions), {
            strict: input.status !== 'DRAFT',
            expectedCount: expected,
        });

        if (check.errors.length) errors.questions = check.errors;

        if (Object.keys(errors).length) {
            return res.status(400).json({ ok: false, error: 'Please check the highlighted fields.', errors: errors });
        }

        const slug = input.title === current.title ? current.slug : await uniqueSlug(db, input.title, id);
        const duration = Math.max(1, Math.min(240, input.duration || subjectConfig.duration_minutes));

        await db.transaction(async function (tx) {
            await tx.execute(
                `UPDATE quizzes SET slug = ?, title = ?, subject = ?, type = ?, status = ?, duration_minutes = ?,
                        total_questions = ?, points_per_question = ?, instructions = ?, published_at = ?
                 WHERE id = ?`,
                [
                    slug,
                    input.title,
                    input.subject,
                    input.type,
                    input.status,
                    duration,
                    check.questions.length,
                    subjectConfig.points_per_question,
                    input.instructions || null,
                    input.status === 'DRAFT' ? current.published_at : current.published_at || new Date(),
                    id,
                ]
            );

            await writeQuestions(tx, id, check.questions);
        });

        const quiz = await db.one('SELECT * FROM quizzes WHERE id = ?', [id]);

        return res.json({ ok: true, quiz: quiz, questions: check.questions });
    } catch (err) {
        console.error('[admin] could not change the assessment:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not change the assessment.' });
    }
});

/** Removes an assessment (with its questions and its results). */
router.delete('/admin/quizzes/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'That assessment does not exist.' });
    }

    try {
        const quiz = await db.one('SELECT id, title FROM quizzes WHERE id = ? LIMIT 1', [id]);
        if (!quiz) {
            return res.status(404).json({ ok: false, error: 'That assessment does not exist.' });
        }

        await db.execute('DELETE FROM quizzes WHERE id = ?', [id]);

        return res.json({ ok: true, deleted: quiz.title });
    } catch (err) {
        console.error('[admin] could not remove the assessment:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not remove the assessment.' });
    }
});

/** Writes the questions of an assessment (inside a transaction). */
async function writeQuestions(tx, quizId, questions) {
    await tx.execute('DELETE FROM questions WHERE quiz_id = ?', [quizId]);

    for (let i = 0; i < questions.length; i += 1) {
        const question = questions[i];
        const options = question.options || [];

        await tx.execute(
            `INSERT INTO questions (quiz_id, position, prompt, code_snippet, option_a, option_b, option_c, option_d, option_e,
                    correct_option, question_type, explanation, points)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                quizId,
                i + 1,
                question.prompt,
                question.code || null,
                options[0] || '',
                options[1] || '',
                options[2] || '',
                options[3] || '',
                options[4] || '',
                question.correct || '',
                question.type || 'MCQ',
                question.explanation || null,
                question.points || 10,
            ]
        );
    }
}

router.get('/admin/overview', requireAdmin, async (req, res) => {
    try {
        const stats = await loadOverview(db);
        return res.json({ ok: true, stats: stats });
    } catch (err) {
        console.error('[admin] could not load the overview:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load the overview.' });
    }
});

router.get('/admin/users', requireAdmin, async (req, res) => {
    try {
        return res.json({ ok: true, users: await loadUsers(db) });
    } catch (err) {
        console.error('[admin] could not load the users:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load the users.' });
    }
});

router.get('/admin/scores', requireAdmin, async (req, res) => {
    try {
        return res.json({ ok: true, scores: await loadScores(db) });
    } catch (err) {
        console.error('[admin] could not load the scores:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load the scores.' });
    }
});

/* ------------------------------------------------------------------ */
/* The courses and their videos                                        */
/* ------------------------------------------------------------------ */

/** Every course with its videos (the admin sees the drafts too). */
async function loadCourses(db, publishedOnly, userId) {
    const where = publishedOnly ? "WHERE c.status = 'PUBLISHED'" : '';

    const courses = await db.query(
        `SELECT c.id, c.slug, c.title, c.subject, c.description, c.instructor, c.status,
                c.position, c.created_at, c.class_id,
                (SELECT COUNT(*) FROM course_videos v WHERE v.course_id = c.id) AS video_count,
                (SELECT COALESCE(SUM(v.duration_seconds), 0) FROM course_videos v WHERE v.course_id = c.id) AS duration
         FROM courses c
         ${where}
         ORDER BY c.position ASC, c.id ASC`
    );

    if (!courses.length) return [];

    const videos = await db.query(
        `SELECT id, course_id, position, title, description, provider, url, file_path, file_name,
                file_size, duration_seconds
         FROM course_videos
         ORDER BY course_id ASC, position ASC, id ASC`
    );

    // What the student watched and what is done.
    let progress = [];
    if (userId) {
        try {
            progress = await db.query(
                'SELECT video_id, course_id, position_seconds, completed FROM lesson_progress WHERE user_id = ?',
                [userId]
            );
        } catch (err) {
            progress = [];
        }
    }

    const progressOf = function (videoId) {
        const row = progress.find(function (item) {
            return Number(item.video_id) === Number(videoId);
        });

        if (!row) return { position_seconds: 0, completed: 0 };

        return {
            position_seconds: Number(row.position_seconds) || 0,
            completed: Number(row.completed) || 0,
        };
    };

    return courses.map(function (course) {
        const list = videos.filter(function (video) {
            return Number(video.course_id) === Number(course.id);
        });

        const withProgress = list.map(function (video) {
            return {
                id: video.id,
                course_id: video.course_id,
                position: video.position,
                title: video.title,
                description: video.description,
                provider: video.provider,
                url: video.url,
                file_path: video.file_path,
                file_name: video.file_name,
                file_size: Number(video.file_size) || 0,
                duration_seconds: Number(video.duration_seconds) || 0,
                // The address the player of the student uses.
                source: video.provider === 'FILE' && video.file_path ? video.file_path : uploads.embedUrl(video.provider, video.url),
                progress: progressOf(video.id),
            };
        });

        const done = withProgress.filter(function (video) {
            return video.progress.completed === 1;
        }).length;

        return Object.assign({}, course, {
            // The icon of the subject - every course looks the same
            // everywhere in the app.
            icon: subjects.iconOf(course.subject),
            completed_count: done,
            videos: withProgress,
        });
    });
}

/**
 * Saves what a student watched.
 *
 * The position of the video and the lessons that are done live in the
 * database, so the student continues on every device.
 */
router.post('/courses/progress', requireAuth, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const videoId = Number(body.videoId);
    const position = Math.max(0, Math.min(86400, Math.round(Number(body.position) || 0)));
    const completed = body.completed === true || body.completed === 1 ? 1 : 0;

    if (!Number.isFinite(videoId) || videoId <= 0) {
        return res.status(400).json({ ok: false, error: 'The video is not known.' });
    }

    try {
        const video = await db.one('SELECT id, course_id FROM course_videos WHERE id = ? LIMIT 1', [videoId]);
        if (!video) {
            return res.status(404).json({ ok: false, error: 'That video does not exist.' });
        }

        await db.execute(
            `INSERT INTO lesson_progress (user_id, video_id, course_id, position_seconds, completed)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                position_seconds = VALUES(position_seconds),
                completed = GREATEST(completed, VALUES(completed))`,
            [req.user.uid, video.id, video.course_id, position, completed]
        );

        return res.json({ ok: true, video_id: video.id, position: position, completed: completed });
    } catch (err) {
        console.error('[courses] could not save the progress:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not save the progress.' });
    }
});

/** A slug that no other course uses yet. */
async function uniqueCourseSlug(db, title, currentId) {
    const base =
        String(title || 'course')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 70) || 'course';

    let slug = base;
    let counter = 2;

    for (let tries = 0; tries < 50; tries += 1) {
        const row = await db.one('SELECT id FROM courses WHERE slug = ? LIMIT 1', [slug]);
        if (!row || (currentId && Number(row.id) === Number(currentId))) return slug;

        slug = base + '-' + counter;
        counter += 1;
    }

    return base + '-' + Date.now().toString(36);
}

/** Every course of the platform (the students see the published ones). */
router.get('/courses', async (req, res) => {
    try {
        const courses = await loadCourses(db, true, req.user ? req.user.uid : 0);
        return res.json({ ok: true, courses: courses });
    } catch (err) {
        console.error('[courses] could not load the courses:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load the courses.' });
    }
});

router.get('/admin/courses', requireAdmin, async (req, res) => {
    try {
        return res.json({ ok: true, courses: await loadCourses(db, false) });
    } catch (err) {
        console.error('[admin] could not load the courses:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load the courses.' });
    }
});

/** Creates a course. */
router.post('/admin/courses', requireAdmin, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const instructor = typeof body.instructor === 'string' ? body.instructor.trim() : '';
    const status = ['DRAFT', 'PUBLISHED', 'COMPLETED'].indexOf(body.status) > -1 ? body.status : 'DRAFT';

    const errors = {};
    if (!title) errors.title = 'A title is required.';
    if (!subject) errors.subject = 'A subject is required.';

    if (Object.keys(errors).length) {
        return res.status(400).json({ ok: false, error: 'Please check the highlighted fields.', errors: errors });
    }

    try {
        const slug = await uniqueCourseSlug(db, title);
        const position = Number(body.position) || 0;

        const result = await db.execute(
            `INSERT INTO courses (slug, title, subject, description, instructor, status, position, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [slug, title.slice(0, 160), subject.slice(0, 80), description || null, instructor || null, status, position, req.user.uid]
        );

        const course = await db.one('SELECT * FROM courses WHERE id = ?', [result.insertId]);

        return res.status(201).json({ ok: true, course: course });
    } catch (err) {
        console.error('[admin] could not create the course:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not create the course.' });
    }
});

/** Changes a course. */
router.put('/admin/courses/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'That course does not exist.' });
    }

    try {
        const current = await db.one('SELECT * FROM courses WHERE id = ? LIMIT 1', [id]);
        if (!current) {
            return res.status(404).json({ ok: false, error: 'That course does not exist.' });
        }

        const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : current.title;
        const subject = typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim() : current.subject;
        const description = typeof body.description === 'string' ? body.description.trim() : current.description || '';
        const instructor = typeof body.instructor === 'string' ? body.instructor.trim() : current.instructor || '';
        const status = ['DRAFT', 'PUBLISHED', 'COMPLETED'].indexOf(body.status) > -1 ? body.status : current.status;
        const position = body.position === undefined ? current.position : Number(body.position) || 0;

        const slug = title === current.title ? current.slug : await uniqueCourseSlug(db, title, id);

        await db.execute(
            `UPDATE courses SET slug = ?, title = ?, subject = ?, description = ?, instructor = ?, status = ?, position = ?
             WHERE id = ?`,
            [slug, title.slice(0, 160), subject.slice(0, 80), description || null, instructor || null, status, position, id]
        );

        const course = await db.one('SELECT * FROM courses WHERE id = ?', [id]);

        return res.json({ ok: true, course: course });
    } catch (err) {
        console.error('[admin] could not change the course:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not change the course.' });
    }
});

/** Removes a course with its videos. */
router.delete('/admin/courses/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'That course does not exist.' });
    }

    try {
        const course = await db.one('SELECT id, title FROM courses WHERE id = ? LIMIT 1', [id]);
        if (!course) {
            return res.status(404).json({ ok: false, error: 'That course does not exist.' });
        }

        const videos = await db.query('SELECT file_path FROM course_videos WHERE course_id = ?', [id]);
        videos.forEach(function (video) {
            uploads.remove(video.file_path);
        });

        await db.execute('DELETE FROM courses WHERE id = ?', [id]);

        return res.json({ ok: true, deleted: course.title });
    } catch (err) {
        console.error('[admin] could not remove the course:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not remove the course.' });
    }
});

/** Adds a video with a link (YouTube, Vimeo or a direct file). */
router.post('/admin/courses/:id/videos', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const duration = Math.max(0, Math.min(86400, Number(body.duration_seconds) || 0));

    const errors = {};
    if (!title) errors.title = 'A title is required.';
    if (!url) errors.url = 'A link is required.';

    if (Object.keys(errors).length) {
        return res.status(400).json({ ok: false, error: 'Please check the highlighted fields.', errors: errors });
    }

    if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({
            ok: false,
            error: 'The link has to start with http:// or https://',
            errors: { url: 'The link has to start with http:// or https://' },
        });
    }

    try {
        const course = await db.one('SELECT id FROM courses WHERE id = ? LIMIT 1', [id]);
        if (!course) {
            return res.status(404).json({ ok: false, error: 'That course does not exist.' });
        }

        const provider = uploads.providerOf(url);
        const position = Number(body.position) || (await nextPosition(db, id));

        const result = await db.execute(
            `INSERT INTO course_videos (course_id, position, title, description, provider, url, duration_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, position, title.slice(0, 160), description || null, provider, url.slice(0, 500), duration]
        );

        const video = await db.one('SELECT * FROM course_videos WHERE id = ?', [result.insertId]);

        return res.status(201).json({ ok: true, video: video, source: uploads.embedUrl(provider, url) });
    } catch (err) {
        console.error('[admin] could not add the video:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not add the video.' });
    }
});

/** The position of the next video of a course. */
async function nextPosition(db, courseId) {
    const row = await db.one('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM course_videos WHERE course_id = ?', [
        courseId,
    ]);

    return row ? Number(row.next) || 1 : 1;
}

/**
 * Uploads a video file.
 *
 * The file comes as the body of the request (the browser sends the file
 * itself), so no extra library is needed.
 */
router.post(
    '/admin/courses/:id/videos/upload',
    requireAdmin,
    express.raw({ type: ['video/*', 'application/octet-stream'], limit: uploads.MAX_SIZE }),
    async (req, res) => {
        const id = Number(req.params.id);
        const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';

        // The name of the file travels encoded in a header.
        let fileName = '';
        try {
            fileName = decodeURIComponent(String(req.headers['x-file-name'] || ''));
        } catch (err) {
            fileName = String(req.headers['x-file-name'] || '');
        }

        if (!Number.isFinite(id)) {
            return res.status(400).json({ ok: false, error: 'That course does not exist.' });
        }

        if (!req.body || !req.body.length) {
            return res.status(400).json({ ok: false, error: 'No file was uploaded.' });
        }

        try {
            const course = await db.one('SELECT id FROM courses WHERE id = ? LIMIT 1', [id]);
            if (!course) {
                return res.status(404).json({ ok: false, error: 'That course does not exist.' });
            }

            const stored = uploads.save(id, fileName, req.body);
            const position = await nextPosition(db, id);

            const result = await db.execute(
                `INSERT INTO course_videos (course_id, position, title, description, provider, url, file_path, file_name, file_size)
                 VALUES (?, ?, ?, ?, 'FILE', NULL, ?, ?, ?)`,
                [
                    id,
                    position,
                    (title || stored.file_name || 'Video').slice(0, 160),
                    null,
                    stored.file_path,
                    stored.file_name.slice(0, 255),
                    stored.file_size,
                ]
            );

            const video = await db.one('SELECT * FROM course_videos WHERE id = ?', [result.insertId]);

            return res.status(201).json({ ok: true, video: video, source: stored.file_path });
        } catch (err) {
            console.error('[admin] could not upload the video:', err.message);
            return res.status(503).json({ ok: false, error: err.message || 'Could not upload the video.' });
        }
    }
);

/** Changes a video. */
router.put('/admin/videos/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'That video does not exist.' });
    }

    try {
        const current = await db.one('SELECT * FROM course_videos WHERE id = ? LIMIT 1', [id]);
        if (!current) {
            return res.status(404).json({ ok: false, error: 'That video does not exist.' });
        }

        const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : current.title;
        const description = typeof body.description === 'string' ? body.description.trim() : current.description || '';
        const duration =
            body.duration_seconds === undefined
                ? current.duration_seconds
                : Math.max(0, Math.min(86400, Number(body.duration_seconds) || 0));
        const position = body.position === undefined ? current.position : Number(body.position) || 0;

        await db.execute(
            'UPDATE course_videos SET title = ?, description = ?, duration_seconds = ?, position = ? WHERE id = ?',
            [title.slice(0, 160), description || null, duration, position, id]
        );

        const video = await db.one('SELECT * FROM course_videos WHERE id = ?', [id]);

        return res.json({ ok: true, video: video });
    } catch (err) {
        console.error('[admin] could not change the video:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not change the video.' });
    }
});

/** Removes a video (and the file it uploaded). */
router.delete('/admin/videos/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'That video does not exist.' });
    }

    try {
        const video = await db.one('SELECT id, title, file_path FROM course_videos WHERE id = ? LIMIT 1', [id]);
        if (!video) {
            return res.status(404).json({ ok: false, error: 'That video does not exist.' });
        }

        uploads.remove(video.file_path);
        await db.execute('DELETE FROM course_videos WHERE id = ?', [id]);

        return res.json({ ok: true, deleted: video.title });
    } catch (err) {
        console.error('[admin] could not remove the video:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not remove the video.' });
    }
});

/* The platform settings ------------------------------------------------ */

router.get('/admin/settings', requireAdmin, async (req, res) => {
    try {
        return res.json({ ok: true, settings: await settings.readAll(db) });
    } catch (err) {
        console.error('[admin] could not load the settings:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load the settings.' });
    }
});

router.post('/admin/settings', requireAdmin, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const keys = Object.keys(body).filter((key) => Object.prototype.hasOwnProperty.call(settings.DEFAULTS, key));

    if (!keys.length) {
        return res.status(400).json({ ok: false, error: 'No known setting was sent.' });
    }

    try {
        for (const key of keys) {
            let value = body[key];

            if (settings.isNumber(key)) {
                const number = Number(value);
                if (!Number.isFinite(number)) {
                    return res.status(400).json({
                        ok: false,
                        error: 'The value of ' + key + ' must be a number.',
                        errors: { [key]: 'Enter a number.' },
                    });
                }
                value = String(number);
            } else {
                // A switch: 1 is on, 0 is off.
                value = value === true || value === 'true' || Number(value) === 1 ? '1' : '0';
            }

            await settings.write(db, key, value);
        }

        return res.json({ ok: true, settings: await settings.readAll(db) });
    } catch (err) {
        console.error('[admin] could not save the settings:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not save the settings.' });
    }
});

/* ------------------------------------------------------------------ */
/* Realtime                                                            */
/* ------------------------------------------------------------------ */

/**
 * The event stream (Server-Sent Events).
 * The client asks for the events it wants to hear about:
 *   GET /api/events?events=message:new,message:reply,presence,stats:updated
 */
router.get('/events', requireAuth, (req, res) => {
    realtime.subscribe(req, res, req.user);
});

/* ------------------------------------------------------------------ */
/* Student progress                                                    */
/* ------------------------------------------------------------------ */

router.get('/profile', requireAuth, async (req, res) => {
    const progress = await progressData.loadProgress(db, req.user.uid);
    return res.json({ ok: true, progress });
});

/** Updates the profile of the signed-in user. */
router.patch('/profile', requireAuth, async (req, res) => {
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
    const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';

    if (!fullName) {
        return res.status(400).json({
            ok: false,
            error: 'Please check the highlighted fields.',
            errors: { fullName: 'A name is required.' },
        });
    }

    try {
        await db.execute('UPDATE users SET full_name = ?, subject = ? WHERE id = ?', [
            fullName.slice(0, 120),
            subject ? subject.slice(0, 80) : null,
            req.user.uid,
        ]);

        const user = await db.one('SELECT id, full_name, username, email, role, subject FROM users WHERE id = ?', [req.user.uid]);

        // The session still carries the old name - keep it in sync.
        const fresh = await db.one('SELECT * FROM users WHERE id = ?', [req.user.uid]);
        startSession(res, fresh, req.user && req.user.remember === true, { secure: isSecureRequest(req) });

        return res.json({ ok: true, user: user });
    } catch (err) {
        console.error('[profile] could not save the profile:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not save your profile.' });
    }
});

/** The preferences of the signed-in user. */
router.get('/profile/preferences', requireAuth, async (req, res) => {
    try {
        return res.json({ ok: true, preferences: await settings.readPreferences(db, req.user.uid) });
    } catch (err) {
        console.error('[settings] could not read the preferences:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load your preferences.' });
    }
});

router.put('/profile/preferences', requireAuth, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    try {
        const preferences = await settings.writePreferences(db, req.user.uid, body);
        return res.json({ ok: true, preferences: preferences });
    } catch (err) {
        console.error('[settings] could not save the preferences:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not save your preferences.' });
    }
});

/* ------------------------------------------------------------------ */
/* Messages - the support inbox of the students                       */
/* ------------------------------------------------------------------ */

const MESSAGE_CATEGORIES = ['support', 'academic', 'account', 'other'];

router.get('/messages', requireAuth, async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT id, subject, body, category, status, reply, created_at, replied_at
             FROM messages
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [req.user.uid]
        );

        return res.json({ ok: true, messages: rows });
    } catch (err) {
        console.error('[messages] could not load the messages:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load your messages.' });
    }
});

router.post('/messages', requireAuth, async (req, res) => {
    const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';
    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    const category = MESSAGE_CATEGORIES.indexOf(req.body.category) > -1 ? req.body.category : 'support';

    const errors = {};
    if (!subject) errors.subject = 'A subject is required.';
    if (!body) errors.body = 'A message is required.';

    if (Object.keys(errors).length) {
        return res.status(400).json({
            ok: false,
            error: 'Please check the highlighted fields.',
            errors: errors,
        });
    }

    try {
        const result = await db.execute(
            'INSERT INTO messages (user_id, subject, body, category, status) VALUES (?, ?, ?, ?, ?)',
            [req.user.uid, subject, body, category, 'open']
        );

        const message = await db.one(
            'SELECT id, subject, body, category, status, reply, created_at FROM messages WHERE id = ?',
            [result.insertId]
        );

        // The admin inbox sees it right away.
        realtime.publish(
            'message:new',
            {
                id: message.id,
                subject: message.subject,
                body: message.body,
                category: message.category,
                status: message.status,
                created_at: message.created_at,
                user_name: req.user.name,
            },
            function (user) {
                return user.role === 'admin';
            }
        );

        return res.status(201).json({ ok: true, message: message });
    } catch (err) {
        console.error('[messages] could not save the message:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not send your message.' });
    }
});

/* The admin side of the inbox ---------------------------------------- */

router.get('/admin/messages', requireAdmin, async (req, res) => {
    try {
        const rows = await db.query(
            `SELECT m.id, m.subject, m.body, m.category, m.status, m.reply, m.created_at, m.replied_at,
                    u.id AS user_id, u.full_name, u.username, u.email, u.role
             FROM messages m
             JOIN users u ON u.id = m.user_id
             ORDER BY FIELD(m.status, 'open', 'answered', 'closed'), m.created_at DESC`
        );

        return res.json({ ok: true, messages: rows });
    } catch (err) {
        console.error('[messages] could not load the inbox:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not load the inbox.' });
    }
});

router.post('/admin/messages/:id/reply', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const reply = typeof req.body.reply === 'string' ? req.body.reply.trim() : '';
    const status = ['open', 'answered', 'closed'].indexOf(req.body.status) > -1 ? req.body.status : 'answered';

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'Unknown message.' });
    }

    if (!reply && status !== 'closed') {
        return res.status(400).json({
            ok: false,
            error: 'Please write a reply.',
            errors: { reply: 'A reply is required.' },
        });
    }

    try {
        const message = await db.one('SELECT id, user_id FROM messages WHERE id = ?', [id]);
        if (!message) {
            return res.status(404).json({ ok: false, error: 'That message does not exist.' });
        }

        await db.execute(
            'UPDATE messages SET reply = ?, replied_by = ?, replied_at = NOW(), status = ? WHERE id = ?',
            [reply || null, req.user.uid, status, id]
        );

        const updated = await db.one(
            `SELECT m.id, m.subject, m.body, m.category, m.status, m.reply, m.created_at, m.replied_at,
                    u.id AS user_id, u.full_name, u.username, u.email
             FROM messages m JOIN users u ON u.id = m.user_id
             WHERE m.id = ?`,
            [id]
        );

        // The student sees the answer without reloading.
        realtime.publish(
            'message:reply',
            {
                id: updated.id,
                reply: updated.reply,
                status: updated.status,
                replied_at: updated.replied_at,
            },
            function (user) {
                return user.uid === message.user_id;
            }
        );

        return res.json({ ok: true, message: updated });
    } catch (err) {
        console.error('[messages] could not save the reply:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not save the reply.' });
    }
});

/* ------------------------------------------------------------------ */
/* Dashboard stats                                                     */
/* ------------------------------------------------------------------ */

router.get('/stats', requireAuth, async (req, res) => {
    try {
        const enrolled = await db.one(
            'SELECT COUNT(*) AS total FROM class_members WHERE user_id = ?',
            [req.user.uid]
        );
        const attempts = await db.one(
            'SELECT COUNT(*) AS total, AVG(score) AS average FROM attempts WHERE user_id = ?',
            [req.user.uid]
        );

        return res.json({
            ok: true,
            enrolledClasses: Number(enrolled.total) || 0,
            quizzesTaken: Number(attempts.total) || 0,
            averageScore: Math.round(Number(attempts.average) || 0),
        });
    } catch (err) {
        return res.status(503).json({ ok: false, error: err.message || 'Could not load your stats.' });
    }
});

module.exports = router;
