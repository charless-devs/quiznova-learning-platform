'use strict';

/**
 * QuizNova - the dates of the interface.
 *
 * The pages show the real day instead of a date that was typed in once.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "24 MAY" */
function shortDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
}

/** "May 24, 2026" */
function longDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return MONTHS_LONG[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

/** "Today, 24 MAY" (or "Tomorrow, 25 MAY" when it is not today). */
function todayLabel(date, prefix) {
    const d = date instanceof Date ? date : new Date(date);
    const label = prefix === false ? shortDate(d) : 'Today, ' + shortDate(d);
    return label;
}

/**
 * The next days, starting with today.
 * @returns {Array} [{ label, weekday, day, month, date }]
 */
function weekStrip(count = 6, from) {
    const start = from instanceof Date ? new Date(from.getTime()) : new Date();
    const days = [];

    for (let i = 0; i < count; i += 1) {
        const date = new Date(start.getTime());
        date.setDate(date.getDate() + i);

        days.push({
            label: MONTHS[date.getMonth()] + ' ' + date.getDate(),
            short: MONTHS[date.getMonth()],
            day: date.getDate(),
            weekday: WEEKDAYS[date.getDay()],
            isToday: i === 0,
            date: date.toISOString().slice(0, 10),
        });
    }

    return days;
}

module.exports = {
    MONTHS,
    MONTHS_LONG,
    WEEKDAYS,
    shortDate,
    longDate,
    todayLabel,
    weekStrip,
};
