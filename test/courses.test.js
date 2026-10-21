'use strict';

/**
 * The courses of the platform: the admin creates them, adds a video with a
 * link or uploads a file, and the students watch them in their portal.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app = require(path.join(ROOT, 'app'));
const auth = require(path.join(ROOT, 'middleware', 'auth'));
const db = require(path.join(ROOT, 'conn'));
const uploads = require(path.join(ROOT, 'utils', 'uploads'));

let server;
let base;
let dbReady = false;

const ADMIN = { id: 1, name: 'Charles Admin', email: 'admin@quiznova.edu', username: 'admin', role: 'admin' };
const STUDENT = { id: 2, name: 'Alex Morgan', email: 'alex.morgan@example.com', username: 'alex', role: 'student' };

test.before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    dbReady = await db.ping();
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close().catch(() => {});
});

function cookieOf(user) {
    const token = auth.encodeSession({
        uid: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        exp: Date.now() + 60000,
    });
    return `qn_session=${token}`;
}

async function api(pathname, options = {}) {
    const config = Object.assign({ headers: {} }, options);
    config.headers = Object.assign({ 'Content-Type': 'application/json' }, config.headers);

    // The body may be given as an object.
    if (config.body && typeof config.body !== 'string') {
        config.body = JSON.stringify(config.body);
    }

    const res = await fetch(base + pathname, config);
    const body = await res.json().catch(() => ({}));

    return { status: res.status, body };
}

async function cleanup(title) {
    if (!title) return;
    await db.execute('DELETE FROM courses WHERE title = ?', [title]).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* The courses                                                         */
/* ------------------------------------------------------------------ */

test('the admin creates a course', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const res = await api('/api/admin/courses', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            title: 'Course Test Algebra',
            subject: 'Mathematics',
            description: 'The lessons of the test.',
            instructor: 'The teacher',
            status: 'DRAFT',
        }),
    });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.course.id, 'the course has an id');
    assert.strictEqual(res.body.course.slug, 'course-test-algebra');
    assert.strictEqual(res.body.course.status, 'DRAFT');

    await cleanup('Course Test Algebra');
});

test('a course needs a title and a subject', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const res = await api('/api/admin/courses', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ title: '', subject: '' }),
    });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.errors.title, 'the title is missing');
    assert.ok(res.body.errors.subject, 'the subject is missing');
});

test('the admin adds a video with a link', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const course = await api('/api/admin/courses', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ title: 'Course Test Videos', subject: 'Mathematics', status: 'PUBLISHED' }),
    });

    const id = course.body.course.id;

    const res = await api('/api/admin/courses/' + id + '/videos', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({
            title: 'The first lesson',
            url: 'https://www.youtube.com/watch?v=aircAruvnKk',
            duration_seconds: 600,
        }),
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.video.provider, 'YOUTUBE', 'the kind of the link is found');
    assert.strictEqual(res.body.source, 'https://www.youtube.com/embed/aircAruvnKk', 'the player gets the address');

    // The student sees the course and the video.
    const courses = await api('/api/courses');
    const found = (courses.body.courses || []).find((item) => Number(item.id) === Number(id));

    assert.ok(found, 'the course is there');
    assert.strictEqual(found.videos.length, 1);
    assert.strictEqual(found.videos[0].source, 'https://www.youtube.com/embed/aircAruvnKk');

    await cleanup('Course Test Videos');
});

test('a video needs a title and a real link', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const course = await api('/api/admin/courses', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ title: 'Course Test Broken Video', subject: 'Mathematics' }),
    });

    const id = course.body.course.id;

    const empty = await api('/api/admin/courses/' + id + '/videos', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ title: '', url: '' }),
    });
    assert.strictEqual(empty.status, 400);

    const broken = await api('/api/admin/courses/' + id + '/videos', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ title: 'A video', url: 'javascript:alert(1)' }),
    });
    assert.strictEqual(broken.status, 400, 'only http links are accepted');

    await cleanup('Course Test Broken Video');
});

test('the admin uploads a video file', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const course = await api('/api/admin/courses', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ title: 'Course Test Upload', subject: 'Mathematics', status: 'PUBLISHED' }),
    });

    const id = course.body.course.id;
    const content = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');

    const res = await fetch(base + '/api/admin/courses/' + id + '/videos/upload?title=' + encodeURIComponent('The uploaded one'), {
        method: 'POST',
        headers: {
            'Content-Type': 'video/mp4',
            'X-File-Name': encodeURIComponent('My Lesson.mp4'),
            Cookie: cookieOf(ADMIN),
        },
        body: content,
    });

    const payload = await res.json();
    assert.strictEqual(res.status, 201, JSON.stringify(payload));
    assert.strictEqual(payload.video.provider, 'FILE');
    assert.strictEqual(payload.video.file_name, 'My Lesson.mp4');
    assert.ok(payload.video.file_path.indexOf('/uploads/videos/') === 0, 'the file lives in the upload folder');

    // The file is really on the disk.
    const stored = path.join(ROOT, 'public', payload.video.file_path);
    assert.ok(fs.existsSync(stored), 'the file was written');

    // And the student can watch it.
    const page = await fetch(base + payload.video.file_path);
    assert.strictEqual(page.status, 200, 'the browser can open the video');

    // Removing the video removes the file.
    const removed = await api('/api/admin/videos/' + payload.video.id, {
        method: 'DELETE',
        headers: { Cookie: cookieOf(ADMIN) },
    });
    assert.strictEqual(removed.status, 200);
    assert.ok(!fs.existsSync(stored), 'the file is gone');

    await cleanup('Course Test Upload');
});

test('a draft course is not visible for the students', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    await api('/api/admin/courses', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ title: 'Course Test Hidden', subject: 'Mathematics', status: 'DRAFT' }),
    });

    const courses = await api('/api/courses');
    const found = (courses.body.courses || []).find((item) => item.title === 'Course Test Hidden');

    assert.strictEqual(found, undefined, 'the student does not see the draft');

    await cleanup('Course Test Hidden');
});

test('a student may not touch the courses of the admin', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const routes = ['/api/admin/courses'];

    for (const route of routes) {
        const res = await api(route, { headers: { Cookie: cookieOf(STUDENT) } });
        assert.strictEqual(res.status, 403, route + ' is for admins');
    }

    const created = await api('/api/admin/courses', {
        method: 'POST',
        headers: { Cookie: cookieOf(STUDENT) },
        body: JSON.stringify({ title: 'Not allowed', subject: 'Mathematics' }),
    });
    assert.strictEqual(created.status, 403);
});

/* ------------------------------------------------------------------ */
/* What a student watched                                              */
/* ------------------------------------------------------------------ */

test('the position of a video and the lessons that are done are kept', async (t) => {
    if (!dbReady) return t.skip('the database is not reachable');

    const course = await api('/api/admin/courses', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ title: 'Course Test Progress', subject: 'Mathematics', status: 'PUBLISHED' }),
    });

    const id = course.body.course.id;

    const video = await api('/api/admin/courses/' + id + '/videos', {
        method: 'POST',
        headers: { Cookie: cookieOf(ADMIN) },
        body: JSON.stringify({ title: 'The lesson', url: 'https://www.youtube.com/watch?v=aircAruvnKk' }),
    });

    assert.strictEqual(video.status, 201);
    const videoId = video.body.video.id;

    // The student saves the position.
    const saved = await api('/api/courses/progress', {
        method: 'POST',
        headers: { Cookie: cookieOf(STUDENT) },
        body: { videoId: videoId, position: 42 },
    });

    assert.strictEqual(saved.status, 200);
    assert.strictEqual(saved.body.position, 42);

    // And it comes back with the course.
    const courses = await api('/api/courses', { headers: { Cookie: cookieOf(STUDENT) } });
    const found = (courses.body.courses || []).find((item) => Number(item.id) === Number(id));

    assert.ok(found, 'the course is there');
    assert.strictEqual(found.videos[0].progress.position_seconds, 42, 'the position is kept');
    assert.strictEqual(found.videos[0].progress.completed, 0);

    // The lesson is done.
    await api('/api/courses/progress', {
        method: 'POST',
        headers: { Cookie: cookieOf(STUDENT) },
        body: { videoId: videoId, position: 100, completed: 1 },
    });

    const after = await api('/api/courses', { headers: { Cookie: cookieOf(STUDENT) } });
    const updated = (after.body.courses || []).find((item) => Number(item.id) === Number(id));

    assert.strictEqual(updated.videos[0].progress.completed, 1, 'the lesson is done');
    assert.strictEqual(updated.completed_count, 1, 'the course counts it');

    // A visitor without a session may not save anything.
    const guest = await api('/api/courses/progress', {
        method: 'POST',
        body: { videoId: videoId, position: 5 },
    });
    assert.strictEqual(guest.status, 401);

    await db.execute('DELETE FROM lesson_progress WHERE video_id = ?', [videoId]);
    await cleanup('Course Test Progress');
});

/* ------------------------------------------------------------------ */
/* The pages                                                           */
/* ------------------------------------------------------------------ */

test('the courses page of the portal works', async () => {
    const res = await fetch(base + '/admin/courses', { headers: { Cookie: cookieOf(ADMIN) }, redirect: 'manual' });
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.ok(html.includes('id="coursesList"'), 'the list of the courses is there');
    assert.ok(html.includes('id="courseTitle"'), 'the form of the course is there');
    assert.ok(html.includes('id="videoAddLink"'), 'a video can be added with a link');
    assert.ok(html.includes('id="videoUpload"'), 'a video can be uploaded');
    assert.ok(html.includes('id="videoFile"'), 'the file picker is there');
    assert.ok(html.includes('/js/admincourses.js'), 'the page has its own script');
});

test('the courses page of the student shows the courses of the platform', async () => {
    const res = await fetch(base + '/courses');
    const html = await res.text();

    assert.strictEqual(res.status, 200);
    assert.ok(html.includes('id="coursesGrid"'), 'the grid is there');
    assert.ok(html.includes('id="courseModal"'), 'the player is there');
    assert.ok(html.includes('id="playerList"'), 'the lessons of the course have a place');
});

/* ------------------------------------------------------------------ */
/* The helpers                                                         */
/* ------------------------------------------------------------------ */

test('the uploads are stored safely', () => {
    assert.strictEqual(uploads.extensionOf('lesson.MP4'), '.mp4');
    assert.strictEqual(uploads.extensionOf('lesson.exe'), '');
    assert.strictEqual(uploads.safeName('My Lesson (1).mp4'), 'my-lesson-1.mp4');

    // The kind of a link is found.
    assert.strictEqual(uploads.providerOf('https://www.youtube.com/watch?v=abc'), 'YOUTUBE');
    assert.strictEqual(uploads.providerOf('https://youtu.be/abc'), 'YOUTUBE');
    assert.strictEqual(uploads.providerOf('https://vimeo.com/12345'), 'VIMEO');
    assert.strictEqual(uploads.providerOf('https://example.com/lesson.mp4'), 'FILE');
    assert.strictEqual(uploads.providerOf('https://example.com/lesson'), 'LINK');

    // The player gets the address of the video.
    assert.strictEqual(
        uploads.embedUrl('YOUTUBE', 'https://www.youtube.com/watch?v=aircAruvnKk'),
        'https://www.youtube.com/embed/aircAruvnKk'
    );
    assert.strictEqual(uploads.embedUrl('VIMEO', 'https://vimeo.com/12345'), 'https://player.vimeo.com/video/12345');
    assert.strictEqual(uploads.embedUrl('LINK', 'https://example.com/a.mp4'), 'https://example.com/a.mp4');
});
