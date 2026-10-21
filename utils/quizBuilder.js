'use strict';

/**
 * QuizNova - the questions of an assessment.
 *
 * The admin types the questions and the answers in the exam builder. This
 * module turns that into the rows of the `questions` table - and it is the
 * same code on the way in (validating) and on the way out (reading).
 */

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E'];

/** The question types the builder knows. */
const TYPES = ['MCQ', 'TRUE_FALSE'];

/** A question that is still empty. */
function emptyQuestion(points = 10) {
    return {
        prompt: '',
        options: ['', '', '', '', ''],
        correct: '',
        points: points,
        type: 'MCQ',
        explanation: '',
    };
}

/** A question with the given number of answers. */
function blankQuestions(count, optionCount = 4, points = 10) {
    const list = [];

    for (let i = 0; i < count; i += 1) {
        const question = emptyQuestion(points);
        question.options = ['', '', '', '', ''].slice(0, Math.max(2, Math.min(5, optionCount)));
        list.push(question);
    }

    return list;
}

/** The text of a value (never null, never undefined). */
function text(value) {
    return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
}

/**
 * Reads the questions of a request.
 *
 * Every question is
 *   { prompt, options: ['a', 'b', ...], correct: 'A', points, type }
 */
function normalise(raw) {
    if (!Array.isArray(raw)) return [];

    return raw.map(function (item) {
        const source = item && typeof item === 'object' ? item : {};

        let options = [];
        if (Array.isArray(source.options)) {
            options = source.options.map(text);
        } else {
            options = OPTION_KEYS.map(function (key) {
                return text(source['option_' + key.toLowerCase()]);
            });
        }

        while (options.length < 5) options.push('');

        const points = Number(source.points);
        const type = TYPES.indexOf(source.type) > -1 ? source.type : 'MCQ';

        return {
            prompt: text(source.prompt),
            code: text(source.code || source.code_snippet),
            options: options.slice(0, 5),
            correct: text(source.correct).toUpperCase().slice(0, 1),
            points: Number.isFinite(points) && points > 0 ? Math.min(100, Math.round(points)) : 10,
            type: type,
            explanation: text(source.explanation),
        };
    });
}

/**
 * Checks the questions of an assessment.
 *
 * A draft may be incomplete (the admin comes back later), a published
 * assessment may not: every question needs a question, at least two answers
 * and the mark of the correct one.
 *
 * @returns {{errors: string[], questions: object[]}}
 */
function validate(questions, options = {}) {
    const errors = [];
    const clean = [];
    const expected = Number(options.expectedCount) || 0;

    questions.forEach(function (question, index) {
        const number = index + 1;
        const answers = question.options.filter(Boolean);
        const hasPrompt = !!question.prompt;
        const hasCorrect = !!question.correct && OPTION_KEYS.indexOf(question.correct) > -1;

        // The answers have to follow each other (A, B, C ...) - otherwise the
        // letter of the correct answer would point at the wrong answer.
        const firstEmpty = question.options.findIndex(function (value) {
            return !value;
        });
        const hasGap =
            firstEmpty > -1 &&
            question.options.slice(firstEmpty).some(function (value) {
                return !!value;
            });

        // An empty slot is not an error - it is just not written yet.
        if (!hasPrompt && answers.length === 0) return;

        if (!hasPrompt) errors.push('Question ' + number + ' needs a question.');
        if (answers.length < 2) errors.push('Question ' + number + ' needs at least two answers.');
        if (hasGap) errors.push('Question ' + number + ': the answers have to follow each other (A, B, C ...).');
        if (!hasCorrect) errors.push('Question ' + number + ' needs the correct answer.');
        else if (!question.options[OPTION_KEYS.indexOf(question.correct)]) {
            errors.push('Question ' + number + ': the correct answer ' + question.correct + ' is empty.');
        }

        clean.push(question);
    });

    if (options.strict) {
        if (!clean.length) errors.push('An assessment needs at least one question.');
        if (expected && clean.length !== expected) {
            errors.push(
                'The subject is set to ' +
                    expected +
                    ' question(s) - this assessment has ' +
                    clean.length +
                    '. Change the number of questions of the subject or the questions of the assessment.'
            );
        }
    }

    return { errors: errors, questions: clean };
}

/** Turns a row of the database into a question of the builder. */
function fromRow(row) {
    return {
        id: row.id,
        position: row.position,
        prompt: row.prompt,
        code: row.code_snippet || '',
        options: [row.option_a, row.option_b, row.option_c, row.option_d, row.option_e].map(function (value) {
            return value === null || value === undefined ? '' : value;
        }),
        correct: row.correct_option || '',
        points: Number(row.points) || 10,
        type: row.question_type || 'MCQ',
        explanation: row.explanation || '',
    };
}

module.exports = {
    OPTION_KEYS,
    TYPES,
    blankQuestions,
    emptyQuestion,
    fromRow,
    normalise,
    validate,
};
