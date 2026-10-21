'use strict';

/**
 * The new student pages: materials, analytics, messages and community.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const materialsData = require(path.join(ROOT, 'data', 'materials'));

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

const CLASSES = [
    {
        code: 'CS101',
        title: 'Intro to Computer Science',
        department: 'Computer Science',
        instructor: 'Dr. Maria Santos',
    },
    {
        code: 'MATH201',
        title: 'Calculus I',
        department: 'Mathematics',
        instructor: 'Prof. James Wilson',
    },
];

test('every class gets a set of material cards', () => {
    const catalogue = materialsData.buildMaterials(CLASSES);

    assert.ok(catalogue.count >= 4, 'each class has a few files');
    assert.ok(catalogue.items.length >= 8);
    assert.deepStrictEqual(catalogue.subjects, ['Computer Science', 'Mathematics']);
});

test('a material card carries everything the page shows', () => {
    const catalogue = materialsData.buildMaterials(CLASSES);
    const item = catalogue.items[0];

    assert.ok(item.label, 'it has a label');
    assert.ok(item.icon, 'it has an icon');
    assert.ok(item.format, 'it has a format');
    assert.ok(item.size, 'it has a size');
    assert.ok(item.pages, 'it has a page count');
    assert.strictEqual(item.classCode, 'CS101');
    assert.strictEqual(item.subject, 'Computer Science');
});

test('the catalogue is stable - the same class always gets the same files', () => {
    const first = materialsData.buildMaterials(CLASSES);
    const second = materialsData.buildMaterials(CLASSES);

    assert.deepStrictEqual(
        first.items.map((item) => item.id + item.size),
        second.items.map((item) => item.id + item.size)
    );
});

/* ------------------------------------------------------------------ */
/* The templates                                                       */
/* ------------------------------------------------------------------ */

test('the community page is a coming soon placeholder', () => {
    const content = fs.readFileSync(path.join(ROOT, 'views', 'community.ejs'), 'utf8');

    assert.ok(content.includes('Coming soon'), 'it says it is coming soon');
    assert.ok(content.includes('being updated'), 'it explains what is happening');
    assert.ok(!content.includes('data-material'), 'it stays empty');
});

test('the messages page has an inbox and a composer', () => {
    const content = fs.readFileSync(path.join(ROOT, 'views', 'messages.ejs'), 'utf8');

    assert.ok(content.includes('data-conversation'), 'the conversation list is there');
    assert.ok(content.includes('messageInput'), 'the composer is there');
    assert.ok(content.includes('qn-bubble'), 'the thread is there');
});

test('the analytics page charts the scores', () => {
    const content = fs.readFileSync(path.join(ROOT, 'views', 'analytics.ejs'), 'utf8');

    assert.ok(content.includes('qn-bar__fill'), 'the score bars are there');
    assert.ok(content.includes('Subject comparison'), 'the subjects are compared');
});

test('the materials page can be filtered', () => {
    const content = fs.readFileSync(path.join(ROOT, 'views', 'materials.ejs'), 'utf8');

    assert.ok(content.includes('materialSearch'), 'it can be searched');
    assert.ok(content.includes('data-subject="'), 'it can be filtered by subject');
    assert.ok(content.includes('data-material'), 'the cards are marked');
});

/* ------------------------------------------------------------------ */
/* The clickable cards                                                 */
/* ------------------------------------------------------------------ */

test('the class cards open the details', () => {
    const page = fs.readFileSync(path.join(ROOT, 'views', 'classes.ejs'), 'utf8');
    const script = fs.readFileSync(path.join(ROOT, 'public', 'js', 'classes.js'), 'utf8');

    assert.ok(page.includes('cursor-pointer'), 'the card shows that it can be clicked');
    assert.ok(script.includes('initClassCards'), 'the card is wired up');
    assert.ok(script.includes("openClassDetails(card.dataset.id)"), 'the card opens the details');
    assert.ok(script.includes("event.target.closest('button, a')"), 'the buttons inside keep working');
});

test('the course cards of the courses page open the course', () => {
    const page = fs.readFileSync(path.join(ROOT, 'views', 'courses.ejs'), 'utf8');
    const script = fs.readFileSync(path.join(ROOT, 'public', 'js', 'courses.js'), 'utf8');

    // The courses come from the database - the card carries the id of the course.
    assert.ok(page.includes('data-course="<%= course.id %>"'), 'the card carries the course');
    assert.ok(page.includes('data-title="<%= course.title %>"'), 'the card carries its data');
    assert.ok(page.includes('cursor-pointer'), 'the card shows that it can be clicked');
    assert.ok(script.includes('initCourseCards'), 'the card is wired up');
    assert.ok(script.includes('openCoursePlayer('), 'the card opens the course');
    assert.ok(script.includes("event.target.closest('button, a')"), 'the buttons inside keep working');
});

test('the Courses link leads to the course page', () => {
    ['dashboard.ejs', 'classes.ejs', 'assessment.ejs'].forEach((file) => {
        const content = fs.readFileSync(path.join(ROOT, 'views', file), 'utf8');
        assert.ok(content.includes('href="/courses"'), file + ' links to the courses');
    });

    const courses = fs.readFileSync(path.join(ROOT, 'views', 'courses.ejs'), 'utf8');
    assert.ok(courses.includes('id="coursesGrid"'), 'the course grid is on the page');
    assert.ok(courses.includes('id="courseModal"'), 'the course modal is on the page');
});

test('the sidebar closes when a link is used', () => {
    const shared = fs.readFileSync(path.join(ROOT, 'public', 'js', 'shared.js'), 'utf8');

    assert.ok(shared.includes('closeSidebarOnNavigate'), 'the sidebar closes on navigation');
    assert.ok(shared.includes("-translate-x-full"), 'the sidebar slides away');
});
