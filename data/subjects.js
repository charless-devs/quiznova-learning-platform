'use strict';

/**
 * QuizNova - the subject catalogue.
 *
 * Every subject a teacher or a student can pick. The icon and the colour
 * are used by the charts, the badges and the filters, so a subject always
 * looks the same in the whole app.
 *
 * The groups:
 *   core    - the main subjects of the platform
 *   basic   - the basics every student needs
 *   it      - the computer and IT tracks
 *   more    - the additional subjects
 */

const SUBJECTS = [
    // ---------------------------------------------------------------- core
    { name: 'Mathematics', icon: 'calculator', color: '#7c3aed', group: 'core' },
    { name: 'Computer Science', icon: 'code', color: '#06b6d4', group: 'core' },
    { name: 'C Programming', icon: 'terminal', color: '#3b82f6', group: 'core' },
    { name: 'English', icon: 'book-open-check', color: '#10b981', group: 'core' },
    { name: 'Filipino', icon: 'feather', color: '#f97316', group: 'core' },
    { name: 'Science', icon: 'flask-conical', color: '#22c55e', group: 'core' },
    { name: 'Physics', icon: 'atom', color: '#f59e0b', group: 'core' },
    { name: 'History', icon: 'landmark', color: '#a16207', group: 'core' },
    { name: 'Graphic Design', icon: 'palette', color: '#ec4899', group: 'core' },
    { name: 'General Knowledge', icon: 'globe-2', color: '#64748b', group: 'core' },

    // --------------------------------------------------------------- basic
    { name: 'Basic Mathematics', icon: 'sigma', color: '#8b5cf6', group: 'basic' },
    { name: 'Basic Science', icon: 'dna', color: '#14b8a6', group: 'basic' },
    { name: 'Basic English', icon: 'spell-check', color: '#34d399', group: 'basic' },
    { name: 'Basic Computer Literacy', icon: 'mouse-pointer-click', color: '#60a5fa', group: 'basic' },
    { name: 'Basic Reading & Writing', icon: 'pen-line', color: '#f472b6', group: 'basic' },

    // ------------------------------------------------------------------ it
    { name: 'IT for Students', icon: 'laptop', color: '#0ea5e9', group: 'it' },
    { name: 'Programming Fundamentals', icon: 'braces', color: '#6366f1', group: 'it' },
    { name: 'Web Development', icon: 'globe', color: '#22d3ee', group: 'it' },
    { name: 'Data Structures & Algorithms', icon: 'network', color: '#8b5cf6', group: 'it' },
    { name: 'Database Management', icon: 'database', color: '#14b8a6', group: 'it' },
    { name: 'Networking & Internet', icon: 'router', color: '#0ea5e9', group: 'it' },
    { name: 'Cybersecurity Basics', icon: 'shield-check', color: '#ef4444', group: 'it' },
    { name: 'Artificial Intelligence Basics', icon: 'brain-circuit', color: '#a855f7', group: 'it' },
    { name: 'Digital Literacy', icon: 'smartphone', color: '#38bdf8', group: 'it' },

    // ---------------------------------------------------------------- more
    { name: 'Calculus', icon: 'sigma', color: '#7c3aed', group: 'more' },
    { name: 'Linear Algebra', icon: 'grid-3x3', color: '#6366f1', group: 'more' },
    { name: 'Statistics & Probability', icon: 'bar-chart-3', color: '#0d9488', group: 'more' },
    { name: 'Chemistry', icon: 'flask-conical', color: '#a3e635', group: 'more' },
    { name: 'Biology', icon: 'leaf', color: '#4ade80', group: 'more' },
    { name: 'Economics', icon: 'trending-up', color: '#f59e0b', group: 'more' },
    { name: 'Accountancy', icon: 'receipt', color: '#84cc16', group: 'more' },
    { name: 'Geography', icon: 'map', color: '#f97316', group: 'more' },
    { name: 'Civic Education', icon: 'landmark', color: '#0ea5e9', group: 'more' },
    { name: 'Ecology', icon: 'trees', color: '#059669', group: 'more' },
];

const GROUPS = [
    { key: 'core', label: 'Main subjects' },
    { key: 'basic', label: 'Basics' },
    { key: 'it', label: 'IT for students' },
    { key: 'more', label: 'More subjects' },
];

/** The name of a subject (or an empty string when it is not known). */
function find(name) {
    if (!name) return null;

    const wanted = String(name).trim().toLowerCase();

    return (
        SUBJECTS.find(function (subject) {
            return subject.name.toLowerCase() === wanted;
        }) || null
    );
}

/** The icon of a subject (a book when the subject is not known). */
function iconOf(name) {
    const subject = find(name);
    return subject ? subject.icon : 'book-open';
}

/** The colour of a subject (violet when the subject is not known). */
function colorOf(name) {
    const subject = find(name);
    return subject ? subject.color : '#7c3aed';
}

/** The subjects of a group. */
function ofGroup(group) {
    return SUBJECTS.filter(function (subject) {
        return subject.group === group;
    });
}

/** Every subject name. */
function names() {
    return SUBJECTS.map(function (subject) {
        return subject.name;
    });
}

module.exports = {
    SUBJECTS,
    GROUPS,
    find,
    iconOf,
    colorOf,
    ofGroup,
    names,
};
