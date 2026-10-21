'use strict';

/**
 * QuizNova - the settings of a subject.
 *
 * Every subject has its own row in the `subject_settings` table:
 *
 *   - question_count      how many questions an assessment of it gets,
 *   - option_count        how many answers a question has (2 - 5),
 *   - duration_minutes    how long an assessment of it may take,
 *   - points_per_question the points of one question.
 *
 * The admin sets these in the exam builder - the builder then creates
 * exactly that many question slots for the subject.
 */

const DEFAULTS = {
    question_count: 10,
    option_count: 4,
    duration_minutes: 20,
    points_per_question: 10,
};

/** The borders of every value. */
const LIMITS = {
    question_count: [1, 100],
    option_count: [2, 5],
    duration_minutes: [1, 240],
    points_per_question: [1, 100],
};

/** Keeps a number inside its borders. */
function clamp(key, value) {
    const range = LIMITS[key] || [0, Number.MAX_SAFE_INTEGER];
    const number = Number(value);

    if (!Number.isFinite(number)) return DEFAULTS[key];

    return Math.max(range[0], Math.min(range[1], Math.round(number)));
}

/** The settings a subject has when it has no row yet. */
function defaults() {
    return Object.assign({}, DEFAULTS);
}

/** Reads the settings of every subject. */
async function readAll(db) {
    const result = {};

    try {
        const rows = await db.query('SELECT * FROM subject_settings');
        rows.forEach((row) => {
            result[row.subject] = {
                subject: row.subject,
                question_count: Number(row.question_count) || DEFAULTS.question_count,
                option_count: Number(row.option_count) || DEFAULTS.option_count,
                duration_minutes: Number(row.duration_minutes) || DEFAULTS.duration_minutes,
                points_per_question: Number(row.points_per_question) || DEFAULTS.points_per_question,
            };
        });
    } catch (err) {
        console.warn('[subjects] could not read the settings:', err.message);
    }

    return result;
}

/** Reads the settings of one subject (the defaults fill the gaps). */
async function read(db, subject) {
    const all = await readAll(db);
    return all[subject] || defaults();
}

/**
 * Saves the settings of one subject.
 *
 * A value that is not sent keeps the value it had - the builder always
 * sends everything, but a partial update must not reset the rest.
 * The values are clipped to their borders, so the builder can never store
 * a broken configuration.
 */
async function write(db, subject, values) {
    const name = String(subject || '').trim().slice(0, 80);
    if (!name) throw new Error('A subject is required.');

    let current = null;
    try {
        current = await db.one('SELECT * FROM subject_settings WHERE subject = ? LIMIT 1', [name]);
    } catch (err) {
        current = null;
    }

    const pick = function (key, fallback) {
        if (!values || values[key] === undefined || values[key] === null || values[key] === '') {
            return current && current[key] !== undefined ? current[key] : fallback;
        }
        return values[key];
    };

    const clean = {
        subject: name,
        question_count: clamp('question_count', pick('question_count', DEFAULTS.question_count)),
        option_count: clamp('option_count', pick('option_count', DEFAULTS.option_count)),
        duration_minutes: clamp('duration_minutes', pick('duration_minutes', DEFAULTS.duration_minutes)),
        points_per_question: clamp(
            'points_per_question',
            pick('points_per_question', DEFAULTS.points_per_question)
        ),
    };

    await db.execute(
        `INSERT INTO subject_settings (subject, question_count, option_count, duration_minutes, points_per_question)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            question_count = VALUES(question_count),
            option_count = VALUES(option_count),
            duration_minutes = VALUES(duration_minutes),
            points_per_question = VALUES(points_per_question)`,
        [
            clean.subject,
            clean.question_count,
            clean.option_count,
            clean.duration_minutes,
            clean.points_per_question,
        ]
    );

    return clean;
}

module.exports = {
    DEFAULTS,
    LIMITS,
    defaults,
    read,
    readAll,
    write,
};
