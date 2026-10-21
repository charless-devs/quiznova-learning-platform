'use strict';

/**
 * QuizNova - student progress.
 *
 * Turns the attempt rows into the model the profile page renders:
 * a radar chart of the subject mastery, the strongest topics, the ones
 * that need attention, the totals and the 7 day trend.
 *
 * The geometry of the two charts is calculated here as well, so the
 * template only has to print SVG.
 */

const subjectCatalogue = require('./subjects');
const dates = require('../utils/dates');

/* ------------------------------------------------------------------ */
/* Subject styling                                                     */
/* ------------------------------------------------------------------ */

const SUBJECT_ICONS = subjectCatalogue.SUBJECTS.reduce(function (icons, subject) {
    icons[subject.name.toLowerCase()] = subject.icon;
    return icons;
}, {});

const SUBJECT_COLORS = [
    { key: 'violet', color: '#7c3aed', soft: '#ede9fe' },
    { key: 'emerald', color: '#10b981', soft: '#d1fae5' },
    { key: 'orange', color: '#f59e0b', soft: '#fef3c7' },
    { key: 'pink', color: '#ec4899', soft: '#fce7f3' },
    { key: 'teal', color: '#06b6d4', soft: '#cffafe' },
    { key: 'blue', color: '#3b82f6', soft: '#dbeafe' },
    { key: 'rose', color: '#f43f5e', soft: '#ffe4e6' },
    { key: 'lime', color: '#84cc16', soft: '#ecfccb' },
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function round(value) {
    return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** "2026-05-24 09:15:00" (MySQL) -> a Date. */
function toDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
        const parsed = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date(value);
}

function dayKey(date) {
    const d = toDate(date);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function startOfDay(date) {
    const d = new Date(date.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Shortens a quiz title to a readable topic name:
 * "Midterm Exam: Derivatives & Integrals" -> "Derivatives & Integrals"
 */
function shortTitle(title, max = 26) {
    const text = String(title || '').trim();
    if (!text) return 'Untitled';

    const colon = text.indexOf(':');
    if (colon > 0 && colon < text.length - 1) {
        const tail = text.slice(colon + 1).trim();
        if (tail) return tail.length > max ? tail.slice(0, max - 1).trim() + '…' : tail;
    }

    return text.length > max ? text.slice(0, max - 1).trim() + '…' : text;
}

/* ------------------------------------------------------------------ */
/* Radar chart                                                         */
/* ------------------------------------------------------------------ */

const RADAR = { cx: 300, cy: 250, radius: 160, width: 600, height: 500 };

/** Builds the polygons, points and label positions of the radar chart. */
function buildRadar(subjects) {
    const count = subjects.length;
    const empty = !count;

    const angles = subjects.map((subject, index) => {
        const step = empty ? 0 : (360 / count) * index;
        return ((-90 + step) * Math.PI) / 180;
    });

    const pointAt = (index, ratio) => ({
        x: round(RADAR.cx + Math.cos(angles[index]) * RADAR.radius * ratio),
        y: round(RADAR.cy + Math.sin(angles[index]) * RADAR.radius * ratio),
    });

    const rings = [0.25, 0.5, 0.75, 1].map((ratio) => ({
        ratio: ratio,
        points: subjects.map((subject, index) => pointAt(index, ratio)),
    }));

    const polygon = subjects.map((subject, index) => pointAt(index, clamp(subject.score, 0, 100) / 100));
    const labels = subjects.map((subject, index) => {
        const angle = angles[index];
        const distance = RADAR.radius + 46;
        return {
            x: round(RADAR.cx + Math.cos(angle) * distance),
            y: round(RADAR.cy + Math.sin(angle) * distance),
            left: round(((RADAR.cx + Math.cos(angle) * distance) / RADAR.width) * 100),
            top: round(((RADAR.cy + Math.sin(angle) * distance) / RADAR.height) * 100),
        };
    });

    return {
        width: RADAR.width,
        height: RADAR.height,
        cx: RADAR.cx,
        cy: RADAR.cy,
        radius: RADAR.radius,
        rings: rings,
        polygon: polygon,
        labels: labels,
        polygonPoints: polygon.map((point) => point.x + ',' + point.y).join(' '),
    };
}

/* ------------------------------------------------------------------ */
/* Trend chart                                                         */
/* ------------------------------------------------------------------ */

const TREND = { width: 340, height: 150, padding: 18 };

/** Builds the line, the area and the labels of the 7 day trend chart. */
function buildTrend(days) {
    const width = TREND.width;
    const height = TREND.height;
    const padding = TREND.padding;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2 - 16;

    const step = days.length > 1 ? innerWidth / (days.length - 1) : innerWidth;

    const points = days.map((day, index) => ({
        x: round(padding + step * index),
        y: round(padding + innerHeight - (clamp(day.value, 0, 100) / 100) * innerHeight),
        label: day.label,
        value: day.value,
    }));

    const base = padding + innerHeight;
    const line = points.length
        ? points.map((point, index) => (index ? 'L' : 'M') + point.x + ',' + point.y).join(' ')
        : '';
    const area = points.length
        ? `M${points[0].x},${base} ` + points.map((point) => 'L' + point.x + ',' + point.y).join(' ') + ` L${points[points.length - 1].x},${base} Z`
        : '';

    return {
        width: width,
        height: height,
        padding: padding,
        base: base,
        points: points,
        line: line,
        area: area,
        labels: points.map((point) => point.label),
    };
}

/* ------------------------------------------------------------------ */
/* The chart of the dashboard                                                */
/* ------------------------------------------------------------------ */

const WEEK = { width: 600, height: 160, padding: 12 };

/**
 * Builds the chart of the dashboard: the score of every day and the share
 * of the correct answers - both in percent, so one scale is enough.
 */
function buildWeekChart(days) {
    const width = WEEK.width;
    const height = WEEK.height;
    const padding = WEEK.padding;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;

    const step = days.length > 1 ? innerWidth / (days.length - 1) : innerWidth;

    const points = days.map(function (day, index) {
        return {
            x: round(padding + step * index),
            scoreY: round(padding + innerHeight - (clamp(day.value || 0, 0, 100) / 100) * innerHeight),
            accuracyY: round(padding + innerHeight - (clamp(day.accuracy || 0, 0, 100) / 100) * innerHeight),
            label: day.label,
            dateLabel: day.dateLabel || day.label,
            value: day.value || 0,
            accuracy: day.accuracy || 0,
            hasData: day.hasData === true,
        };
    });

    const base = padding + innerHeight;

    const line = function (key) {
        return points.map(function (point, index) {
            return (index ? 'L' : 'M') + point.x + ',' + point[key];
        }).join(' ');
    };

    const area = function (key) {
        if (!points.length) return '';
        return (
            'M' + points[0].x + ',' + base + ' ' +
            points.map(function (point) {
                return 'L' + point.x + ',' + point[key];
            }).join(' ') +
            ' L' + points[points.length - 1].x + ',' + base + ' Z'
        );
    };

    // The horizontal lines of the grid (100%, 75%, 50%, 25%, 0%).
    const grid = [0, 25, 50, 75, 100].map(function (value) {
        return {
            value: value,
            y: round(padding + innerHeight - (value / 100) * innerHeight),
        };
    });

    return {
        width: width,
        height: height,
        padding: padding,
        base: base,
        points: points,
        grid: grid,
        scoreLine: line('scoreY'),
        scoreArea: area('scoreY'),
        accuracyLine: line('accuracyY'),
        accuracyArea: area('accuracyY'),
    };
}

/* The model                                                           */
/* ------------------------------------------------------------------ */

/**
 * Builds the whole progress model.
 *
 * @param {Array} attempts  the attempt rows (joined with their quiz)
 * @param {Array} subjects  every subject a quiz exists for (fallback)
 */
function buildProgress(attempts, subjects = []) {
    const rows = (attempts || []).map((row) => ({
        title: row.title,
        subject: row.subject || 'General',
        slug: row.slug || '',
        score: Number(row.score) || 0,
        correct: Number(row.correct_count) || 0,
        total: Number(row.total_questions) || 0,
        seconds: Number(row.time_spent_seconds) || 0,
        date: toDate(row.submitted_at),
    }));

    /* Subject mastery ------------------------------------------------ */
    const bySubject = new Map();
    rows.forEach((row) => {
        if (!bySubject.has(row.subject)) bySubject.set(row.subject, []);
        bySubject.get(row.subject).push(row.score);
    });

    const fallbackSubjects = (subjects || [])
        .filter(Boolean)
        .map((subject) => subject.trim())
        .filter((subject, index, list) => list.indexOf(subject) === index);

    const names = [...bySubject.keys()];
    fallbackSubjects.forEach((subject) => {
        if (!names.includes(subject)) names.push(subject);
    });

    const ranked = names
        .map((name) => ({
            name: name,
            score: bySubject.has(name) ? Math.round(average(bySubject.get(name))) : 0,
            attempts: bySubject.has(name) ? bySubject.get(name).length : 0,
        }))
        .sort((a, b) => b.score - a.score || b.attempts - a.attempts || a.name.localeCompare(b.name))
        .slice(0, 6);

    ranked.forEach((subject, index) => {
        const known = subjectCatalogue.find(subject.name);

        if (known) {
            // A known subject keeps its own colour everywhere.
            subject.color = known.color;
            subject.soft = known.color + '22';
            subject.key = known.group;
            subject.icon = known.icon;
        } else {
            const style = SUBJECT_COLORS[index % SUBJECT_COLORS.length];
            subject.color = style.color;
            subject.soft = style.soft;
            subject.key = style.key;
            subject.icon = SUBJECT_ICONS[subject.name.toLowerCase()] || 'book-open';
        }

        subject.slug = subject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    });

    /* Totals --------------------------------------------------------- */
    const totalCorrect = rows.reduce((sum, row) => sum + row.correct, 0);
    const totalQuestions = rows.reduce((sum, row) => sum + row.total, 0);
    const totalSeconds = rows.reduce((sum, row) => sum + row.seconds, 0);
    const points = totalCorrect * 10;
    const level = Math.max(1, Math.floor(Math.sqrt(points / 20)) + 1);
    const accuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const overall = rows.length ? Math.round(average(rows.map((row) => row.score))) : 0;

    /* Streak --------------------------------------------------------- */
    const attemptDays = new Set(rows.map((row) => dayKey(row.date)));
    let streak = 0;
    const cursor = startOfDay(new Date());
    if (!attemptDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (attemptDays.has(dayKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    /* Strengths + attention ------------------------------------------ */
    const topics = rows
        .map((row) => ({
            label: shortTitle(row.title),
            full: row.title,
            value: Math.round(row.score),
            subject: row.subject,
        }))
        .sort((a, b) => b.value - a.value);

    const strengths = topics.slice(0, 3);
    const attention = topics
        .slice(-3)
        .reverse()
        .filter((topic, index, list) => list.findIndex((t) => t.label === topic.label) === index);

    /* 7 day trend ----------------------------------------------------- */
    const today = startOfDay(new Date());
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
        const date = new Date(today.getTime());
        date.setDate(date.getDate() - offset);
        const key = dayKey(date);

        const ofTheDay = rows.filter(function (row) {
            return dayKey(row.date) === key;
        });

        const scores = ofTheDay.map(function (row) {
            return row.score;
        });
        const correct = ofTheDay.reduce(function (sum, row) {
            return sum + row.correct;
        }, 0);
        const questions = ofTheDay.reduce(function (sum, row) {
            return sum + row.total;
        }, 0);

        days.push({
            key: key,
            label: DAY_LABELS[date.getDay()],
            dateLabel: dates.MONTHS[date.getMonth()] + ' ' + date.getDate(),
            value: scores.length ? Math.round(average(scores)) : null,
            accuracy: questions ? Math.round((correct / questions) * 100) : null,
            hasData: scores.length > 0,
        });
    }

    // A day without an attempt keeps the score of the day before.
    let carried = 0;
    let carriedAccuracy = 0;

    days.forEach(function (day) {
        if (day.value === null) {
            day.value = carried;
            day.accuracy = carriedAccuracy;
        } else {
            carried = day.value;
            carriedAccuracy = day.accuracy || 0;
        }
    });

    const trend = buildTrend(days);
    const week = buildWeekChart(days);

    /* Recent attempts ------------------------------------------------- */
    const history = rows
        .slice()
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((row) => ({
            title: row.title,
            label: shortTitle(row.title),
            subject: row.subject,
            slug: row.slug,
            score: Math.round(row.score),
            correct: row.correct,
            total: row.total,
            date: row.date.toISOString().slice(0, 10),
        }));

    const recent = history
        .slice()
        .reverse()
        .slice(0, 5)
        .map((row) => ({
            title: row.title,
            subject: row.subject,
            slug: row.slug,
            score: row.score,
            date: row.date,
        }));

    return {
        level: level,
        points: points,
        streak: streak,
        accuracy: accuracy,
        overall: overall,
        quizzes: rows.length,
        totalSeconds: totalSeconds,
        totalMinutes: Math.round(totalSeconds / 60),
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.round((totalSeconds % 3600) / 60),
        subjects: ranked,
        strengths: strengths,
        attention: attention,
        trend: trend,
        week: week,
        history: history,
        recent: recent,
        radar: buildRadar(ranked),
        hasData: rows.length > 0,
    };
}

/**
 * Loads the progress of a user from the database.
 * Falls back to an empty profile when the database is unreachable.
 */
async function loadProgress(db, userId) {
    try {
        const attempts = await db.query(
            `SELECT a.score, a.correct_count, a.total_questions, a.time_spent_seconds, a.submitted_at,
                    q.title, q.subject, q.slug
             FROM attempts a
             JOIN quizzes q ON q.id = a.quiz_id
             WHERE a.user_id = ?
             ORDER BY a.submitted_at ASC`,
            [userId]
        );

        const subjects = await db.query('SELECT DISTINCT subject FROM quizzes ORDER BY subject');

        return buildProgress(attempts, subjects.map((row) => row.subject));
    } catch (err) {
        console.warn('[progress] could not load the progress:', err.message);
        return buildProgress([], []);
    }
}

module.exports = {
    SUBJECT_ICONS,
    SUBJECT_COLORS,
    buildProgress,
    buildRadar,
    buildTrend,
    loadProgress,
    shortTitle,
};
