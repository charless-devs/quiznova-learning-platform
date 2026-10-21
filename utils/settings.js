'use strict';

/**
 * QuizNova - platform settings.
 *
 * A tiny key / value store. The values are read by the app (the passing
 * score, the registration switch, the maintenance mode) and edited by the
 * admin in /admin/settings.
 */

const DEFAULTS = {
    maintenance: '0',
    registration_open: '1',
    default_duration: '20',
    passing_score: '60',
};

const NUMBERS = ['default_duration', 'passing_score'];

/** Reads every setting (the defaults fill the gaps). */
async function readAll(db) {
    const settings = Object.assign({}, DEFAULTS);

    try {
        const rows = await db.query('SELECT setting_key, setting_value FROM settings');
        rows.forEach((row) => {
            // The preferences of a user live in the same table but are not
            // platform settings.
            if (row.setting_key.indexOf('pref:') === 0) return;
            settings[row.setting_key] = row.setting_value;
        });
    } catch (err) {
        console.warn('[settings] could not read the settings:', err.message);
    }

    return settings;
}

/** Reads one setting. */
async function read(db, key) {
    const settings = await readAll(db);
    return settings[key] !== undefined ? settings[key] : DEFAULTS[key];
}

/** Reads one setting as a number. */
async function readNumber(db, key) {
    const value = await read(db, key);
    const number = Number(value);
    return Number.isFinite(number) ? number : Number(DEFAULTS[key]);
}

/** Writes one setting. */
async function write(db, key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
        throw new Error('Unknown setting: ' + key);
    }

    const clean = String(value).slice(0, 255);

    await db.execute(
        `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, clean]
    );

    return clean;
}

/** Is the value a number setting? */
function isNumber(key) {
    return NUMBERS.indexOf(key) > -1;
}

/* ------------------------------------------------------------------ */
/* The preferences of a user                                           */
/* ------------------------------------------------------------------ */

const PREFERENCES = {
    theme: 'dark',
    email_notifications: 1,
    quiz_sound: 1,
    daily_goal: 5,
    show_progress: 1,
};

/** Reads the preferences of a user. */
async function readPreferences(db, userId) {
    const preferences = Object.assign({}, PREFERENCES);

    try {
        const row = await db.one('SELECT setting_value FROM settings WHERE setting_key = ?', ['pref:' + userId]);
        if (!row) return preferences;

        const stored = JSON.parse(row.setting_value);
        Object.keys(stored).forEach(function (key) {
            if (key in PREFERENCES) preferences[key] = stored[key];
        });
    } catch (err) {
        console.warn('[settings] could not read the preferences:', err.message);
    }

    return preferences;
}

/** Saves the preferences of a user. */
async function writePreferences(db, userId, values) {
    const clean = {};

    Object.keys(PREFERENCES).forEach(function (key) {
        if (!(key in values)) return;

        let value = values[key];
        if (key === 'daily_goal') {
            value = Math.max(1, Math.min(50, Number(value) || PREFERENCES.daily_goal));
        } else if (key === 'theme') {
            value = ['dark', 'light'].indexOf(value) > -1 ? value : PREFERENCES.theme;
        } else {
            value = Number(value) === 1 || value === true ? 1 : 0;
        }

        clean[key] = value;
    });

    await db.execute(
        `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        ['pref:' + userId, JSON.stringify(clean)]
    );

    return Object.assign({}, PREFERENCES, clean);
}

module.exports = {
    DEFAULTS,
    PREFERENCES,
    readAll,
    read,
    readNumber,
    write,
    isNumber,
    readPreferences,
    writePreferences,
};
