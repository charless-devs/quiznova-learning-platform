'use strict';

/**
 * QuizNova - the repair of broken characters.
 *
 * A text that was encoded as Windows-1252 and read as UTF-8 shows up as
 * three characters instead of a bullet, as "Schrodinger" with a broken o or
 * as four strange letters instead of an emoji. This module finds those
 * places and puts the original characters back.
 *
 *   node utils/encoding.js            (the files of the project)
 *   npm run fix:encoding              (the files + the database)
 */

/* The characters Windows-1252 puts in the range 0x80 - 0x9F. */
const CP1252 = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f,
};

/* The characters a broken encoding produces (as escapes). */
const SUSPECT = new RegExp(
    '[\\u0080-\\u00ff' +
        '\\u0152\\u0153\\u0160\\u0161\\u0178\\u017d\\u017e\\u0192\\u02c6\\u02dc' +
        '\\u2013\\u2014\\u2018\\u2019\\u201a\\u201c\\u201d\\u201e' +
        '\\u2020\\u2021\\u2022\\u2026\\u2030\\u2039\\u203a\\u2122]+',
    'g'
);

/** The bytes of a broken string (Windows-1252). */
function toBytes(text) {
    const bytes = [];

    for (const character of text) {
        const code = character.codePointAt(0);

        if (CP1252[code] !== undefined) bytes.push(CP1252[code]);
        else if (code <= 0xff) bytes.push(code);
        else return null; // not a broken run
    }

    return Buffer.from(bytes);
}

/** Repairs the longest broken sequence of a run. */
function repairRun(run) {
    let out = '';
    let rest = run;

    while (rest.length) {
        let done = false;

        for (let length = rest.length; length >= 2; length -= 1) {
            const part = rest.slice(0, length);
            const bytes = toBytes(part);
            if (!bytes) continue;

            const decoded = bytes.toString('utf8');

            // Only the runs that really are a broken UTF-8 sequence.
            if (decoded.indexOf('\ufffd') > -1) continue;
            if (decoded === part) continue;
            out += decoded;
            rest = rest.slice(length);
            done = true;
            break;
        }

        if (!done) {
            out += rest.charAt(0);
            rest = rest.slice(1);
        }
    }

    return out;
}

/**
 * Repairs a text.
 *
 * @returns {{text: string, fixed: boolean}}
 */
function repair(text) {
    if (typeof text !== 'string') return { text: text, fixed: false };

    let fixed = false;

    const out = text.replace(SUSPECT, function (run) {
        const decoded = repairRun(run);
        if (decoded === run) return run;

        fixed = true;
        return decoded;
    });

    return { text: out, fixed: fixed };
}

/** True when the text holds broken characters. */
function isBroken(text) {
    if (typeof text !== 'string') return false;

    return text.replace(SUSPECT, function (run) {
        return repairRun(run) === run ? '' : '\u0000';
    }).indexOf('\u0000') > -1;
}

module.exports = { repair, isBroken, CP1252, SUSPECT };
