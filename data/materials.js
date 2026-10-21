'use strict';

/**
 * QuizNova - study materials.
 *
 * Turns the classes of a student into the resource cards the materials page
 * shows. The files themselves are not stored - the cards are the catalogue.
 */

const TYPES = [
    { key: 'notes', label: 'Lecture notes', icon: 'file-text', format: 'PDF', pages: 24 },
    { key: 'slides', label: 'Slide deck', icon: 'presentation', format: 'PPTX', pages: 42 },
    { key: 'practice', label: 'Practice set', icon: 'pencil-ruler', format: 'PDF', pages: 12 },
    { key: 'past', label: 'Past paper', icon: 'archive', format: 'PDF', pages: 18 },
    { key: 'cheatsheet', label: 'Formula sheet', icon: 'sigma', format: 'PDF', pages: 2 },
];

/** Deterministic pseudo random number, so a class always gets the same sizes. */
function seededRandom(seed) {
    let value = 0;
    for (let i = 0; i < seed.length; i += 1) {
        value = (value * 31 + seed.charCodeAt(i)) % 100000;
    }
    return value / 100000;
}

/** Builds the material cards of a class. */
function materialsFor(klass) {
    const count = 3 + Math.round(seededRandom(klass.code || klass.title) * 2);

    return TYPES.slice(0, count).map(function (type, index) {
        const size = (0.6 + seededRandom(klass.code + type.key) * 7).toFixed(1);

        return {
            id: (klass.code || 'x') + '-' + type.key,
            type: type.key,
            title: type.label + ' - ' + (klass.title || ''),
            label: type.label,
            icon: type.icon,
            format: type.format,
            pages: type.pages,
            size: size + ' MB',
            subject: klass.department || 'General',
            classCode: klass.code || '',
            classTitle: klass.title || '',
            instructor: klass.instructor || '',
            updated: ['Today', 'Yesterday', '3 days ago', '1 week ago'][index % 4],
        };
    });
}

/** Builds the whole catalogue for a list of classes. */
function buildMaterials(classes) {
    const list = (classes || []).map(function (klass) {
        return materialsFor(klass);
    });

    const flat = list.reduce(function (all, items) {
        return all.concat(items);
    }, []);

    const subjects = [];
    flat.forEach(function (item) {
        if (!subjects.includes(item.subject)) subjects.push(item.subject);
    });

    return {
        items: flat,
        subjects: subjects.sort(),
        count: flat.length,
    };
}

module.exports = {
    TYPES,
    buildMaterials,
    materialsFor,
};
