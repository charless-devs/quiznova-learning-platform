'use strict';

/**
 * QuizNova - page routes.
 * Each page renders its EJS template and receives a small data payload.
 */

const express = require('express');

const db = require('../conn');
const bank = require('../data/questionBank');
const materialsData = require('../data/materials');
const progressData = require('../data/progress');
const subjects = require('../data/subjects');
const settings = require('../utils/settings');
const subjectSettings = require('../utils/subjectSettings');
const uploads = require('../utils/uploads');
const dates = require('../utils/dates');
const { landingFor, isAdmin } = require('../middleware/auth');

const router = express.Router();

/* ------------------------------------------------------------------ */
/* The admin data                                                      */
/* ------------------------------------------------------------------ */

/** Everything the admin pages need. */
async function loadAdminData(userId) {
    const empty = { stats: null, users: [], scores: [], quizzes: [], settings: {} };

    try {
        const [quizzes, students, attempts, messages] = await Promise.all([
            db.one('SELECT COUNT(*) AS total FROM quizzes'),
            db.one("SELECT COUNT(*) AS total FROM users WHERE role = 'student'"),
            db.one('SELECT COUNT(*) AS total, AVG(score) AS average FROM attempts'),
            db.one("SELECT COUNT(*) AS total FROM messages WHERE status = 'open'"),
        ]);

        const totalAttempts = Number(attempts.total) || 0;
        const passingScore = await settings.readNumber(db, 'passing_score');
        let passed = 0;

        if (totalAttempts) {
            const rows = await db.query('SELECT score FROM attempts');
            passed = rows.filter((row) => Number(row.score) >= passingScore).length;
        }

        const users = await db.query(
            `SELECT u.id, u.full_name, u.username, u.email, u.role, u.subject, u.created_at,
                    COUNT(a.id) AS attempts,
                    COALESCE(ROUND(AVG(a.score)), 0) AS average
             FROM users u
             LEFT JOIN attempts a ON a.user_id = u.id
             GROUP BY u.id
             ORDER BY u.created_at ASC`
        );

        const scores = await db.query(
            `SELECT a.id, a.score, a.correct_count, a.total_questions, a.time_spent_seconds, a.submitted_at,
                    u.id AS user_id, u.full_name, u.username, u.email,
                    q.id AS quiz_id, q.title, q.subject
             FROM attempts a
             JOIN users u ON u.id = a.user_id
             JOIN quizzes q ON q.id = a.quiz_id
             ORDER BY a.submitted_at DESC`
        );

        const quizList = await db.query(
            `SELECT q.id, q.slug, q.title, q.subject, q.type, q.status, q.duration_minutes, q.total_questions,
                    c.code AS class_code
             FROM quizzes q
             LEFT JOIN classes c ON c.id = q.class_id
             ORDER BY q.id ASC`
        );

        const inbox = await db.query(
            `SELECT m.id, m.subject, m.body, m.category, m.status, m.reply, m.created_at, m.replied_at,
                    u.id AS user_id, u.full_name, u.username, u.email, u.role
             FROM messages m
             JOIN users u ON u.id = m.user_id
             ORDER BY FIELD(m.status, 'open', 'answered', 'closed'), m.created_at DESC`
        );

        // The account of the administrator who is looking at the portal.
        let account = null;
        try {
            account = await db.one(
                'SELECT id, full_name, username, email, role, subject, created_at FROM users WHERE id = ? LIMIT 1',
                [userId || 0]
            );
        } catch (err) {
            account = null;
        }

        return {
            stats: {
                quizzes: Number(quizzes.total) || 0,
                students: Number(students.total) || 0,
                attempts: totalAttempts,
                average: Math.round(Number(attempts.average) || 0),
                openMessages: Number(messages.total) || 0,
                passingScore: passingScore,
                passRate: totalAttempts ? Math.round((passed / totalAttempts) * 100) : 0,
            },
            users: users,
            scores: scores,
            quizzes: quizList,
            inbox: inbox,
            account: account,
            settings: await settings.readAll(db),
            subjectSettings: await subjectSettings.readAll(db),
            today: dates.longDate(new Date()),
        };
    } catch (err) {
        console.error('[admin] could not load the data:', err.message);
        return empty;
    }
}

/** Loads demo data from MySQL, falling back to the bundled sample data. */
async function loadClasses(userId) {
    try {
        const rows = await db.query(
            `SELECT c.id, c.code, c.title, c.department, c.instructor, c.status, c.is_live,
                    c.description, c.schedule,
                    (cm.user_id IS NOT NULL) AS enrolled
             FROM classes c
             LEFT JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = ?
             ORDER BY c.is_live DESC, c.code ASC`,
            [userId || 0]
        );
        return rows;
    } catch {
        return bank.classes.map((item) => ({
            id: item.code,
            code: item.code,
            title: item.title,
            department: item.department,
            instructor: item.instructor,
            status: item.status,
            is_live: item.isLive,
            description: item.description,
            schedule: item.schedule,
            enrolled: 0,
        }));
    }
}

/** The assessments the students may take (everything but the drafts). */
async function loadPublishedQuizzes(db) {
    try {
        const rows = await db.query(
            `SELECT q.id, q.slug, q.title, q.subject, q.type, q.status, q.duration_minutes, q.total_questions,
                    q.points_per_question, q.published_at,
                    (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = q.id) AS question_count
             FROM quizzes q
             WHERE q.status <> 'DRAFT'
               AND q.slug <> 'rapidhunt-live-coding'
               AND (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = q.id) > 0
             ORDER BY q.id DESC`
        );

        return rows;
    } catch (err) {
        console.error('[assessments] could not load the assessments:', err.message);
        return [];
    }
}

/** The courses the students may watch (the published ones with their videos). */
async function loadPublishedCourses(db, userId) {
    try {
        const courses = await db.query(
            `SELECT c.id, c.slug, c.title, c.subject, c.description, c.instructor, c.position,
                    (SELECT COUNT(*) FROM course_videos v WHERE v.course_id = c.id) AS video_count,
                    (SELECT COALESCE(SUM(v.duration_seconds), 0) FROM course_videos v WHERE v.course_id = c.id) AS duration
             FROM courses c
             WHERE c.status = 'PUBLISHED'
             ORDER BY c.position ASC, c.id ASC`
        );

        if (!courses.length) return [];

        const videos = await db.query(
            `SELECT id, course_id, position, title, description, provider, url, file_path, duration_seconds
             FROM course_videos
             ORDER BY course_id ASC, position ASC, id ASC`
        );

        // What the student watched and what is done.
        let progress = [];
        if (userId) {
            try {
                progress = await db.query(
                    'SELECT video_id, position_seconds, completed FROM lesson_progress WHERE user_id = ?',
                    [userId]
                );
            } catch (err) {
                progress = [];
            }
        }

        return courses.map(function (course) {
            const list = videos.filter(function (video) {
                return Number(video.course_id) === Number(course.id);
            });

            const withProgress = list.map(function (video) {
                const row = progress.find(function (item) {
                    return Number(item.video_id) === Number(video.id);
                });

                return {
                    id: video.id,
                    title: video.title,
                    description: video.description,
                    provider: video.provider,
                    duration_seconds: Number(video.duration_seconds) || 0,
                    source:
                        video.provider === 'FILE' && video.file_path
                            ? video.file_path
                            : uploads.embedUrl(video.provider, video.url),
                    progress: {
                        position_seconds: row ? Number(row.position_seconds) || 0 : 0,
                        completed: row ? Number(row.completed) || 0 : 0,
                    },
                };
            });

            const done = withProgress.filter(function (video) {
                return video.progress.completed === 1;
            }).length;

            return Object.assign({}, course, {
                // The icon of the subject, so every course looks the same
                // everywhere in the app.
                icon: subjects.iconOf(course.subject),
                completed_count: done,
                videos: withProgress,
            });
        });
    } catch (err) {
        console.error('[courses] could not load the courses:', err.message);
        return [];
    }
}

/** Renders the "not allowed" page. */
function forbidden(res, message, user) {
    const home = landingFor(user);
    return res.status(403).send(
        `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
         <title>403 - QuizNova</title>
         <style>body{background:#0b0f19;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;
         align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}
         .box{max-width:520px;padding:40px}
         h1{font-size:56px;margin:0;color:#f43f5e}
         p{color:#94a3b8;line-height:1.6}
         a{display:inline-block;margin-top:18px;padding:10px 20px;background:#7c3aed;color:#fff;
         border-radius:12px;text-decoration:none;font-weight:600}
         a.ghost{background:transparent;border:1px solid #1f293d;color:#cbd5e1;margin-left:8px}</style></head>
         <body><div class="box"><h1>403</h1>
         <p>${String(message).replace(/[<>&"]/g, '')}</p>
         <p>Only accounts with the <strong>admin</strong> role can open the admin portal.</p>
         <a href="${home}">Go to the dashboard</a>
         <a class="ghost" href="/">Home</a></div></body></html>`
    );
}

router.get('/', (req, res) => {
    res.render('homepage', { user: req.user });
});

router.get('/accsetup', (req, res) => {
    // Already signed in? Skip the form and go straight to the right portal.
    if (req.user) {
        return res.redirect(landingFor(req.user, req.query.next));
    }
    res.render('register_login', { user: null, next: req.query.next || '', subjects: subjects.SUBJECTS });
});

router.get('/dashboard', async (req, res) => {
    const courses = await loadPublishedCourses(db, req.user ? req.user.uid : 0);

    // The chart of the progress needs the attempts of the student.
    let progress = null;
    if (req.user) {
        progress = await progressData.loadProgress(db, req.user.uid);
    }

    res.render('dashboard', {
        user: req.user,
        today: dates.todayLabel(new Date()),
        week: dates.weekStrip(6),
        courses: courses,
        progress: progress,
    });
});

router.get('/classes', async (req, res) => {
    const classes = await loadClasses(req.user ? req.user.uid : 0);

    // How many quizzes and members every class has.
    let quizCounts = [];
    let memberCounts = [];
    let courseCount = 0;

    try {
        quizCounts = await db.query('SELECT class_id, COUNT(*) AS total FROM quizzes GROUP BY class_id');
        memberCounts = await db.query('SELECT class_id, COUNT(*) AS total FROM class_members GROUP BY class_id');

        const row = await db.one("SELECT COUNT(*) AS total FROM courses WHERE status = 'PUBLISHED'");
        courseCount = row ? Number(row.total) || 0 : 0;
    } catch (err) {
        quizCounts = [];
        memberCounts = [];
    }

    const countOf = function (list, classId) {
        const row = list.find(function (item) {
            return Number(item.class_id) === Number(classId);
        });
        return row ? Number(row.total) || 0 : 0;
    };

    classes.forEach(function (klass) {
        klass.quiz_count = countOf(quizCounts, klass.id);
        klass.member_count = countOf(memberCounts, klass.id);
    });

    // The numbers of the page come from the database.
    let progress = null;
    if (req.user) {
        progress = await progressData.loadProgress(db, req.user.uid);
    }

    const enrolled = classes.filter(function (item) {
        return Number(item.enrolled) === 1;
    }).length;
    const live = classes.filter(function (item) {
        return Number(item.is_live) === 1;
    }).length;

    // The assessments the student has not taken yet.
    let waiting = 0;
    try {
        const quizzes = await db.query("SELECT slug FROM quizzes WHERE status <> 'DRAFT'");
        const taken = new Set();

        if (progress && progress.recent) {
            progress.recent.forEach(function (item) {
                if (item.slug) taken.add(item.slug);
            });
        }

        waiting = quizzes.filter(function (quiz) {
            return !taken.has(quiz.slug);
        }).length;
    } catch (err) {
        waiting = 0;
    }

    res.render('classes', {
        user: req.user,
        classes: classes,
        subjects: subjects.SUBJECTS,
        progress: progress,
        enrolledCount: enrolled,
        liveCount: live,
        waitingCount: waiting,
        courseCount: courseCount,
    });
});

/* My courses - the course list of the student. */
router.get('/courses', async (req, res) => {
    const courses = await loadPublishedCourses(db, req.user ? req.user.uid : 0);
    res.render('courses', { user: req.user, query: req.query.q || '', courses: courses });
});

router.get('/assessment', async (req, res) => {
    const quizzes = await loadPublishedQuizzes(db);

    // The numbers of the student come from the database - nothing is made up.
    let progress = null;
    if (req.user) {
        progress = await progressData.loadProgress(db, req.user.uid);
    }

    // The quizzes the student has not taken yet.
    const taken = new Set();
    if (progress && progress.recent) {
        progress.recent.forEach(function (item) {
            if (item.slug) taken.add(item.slug);
        });
    }

    const open = quizzes.filter(function (quiz) {
        return !taken.has(quiz.slug);
    });

    // How many courses the student can watch.
    let courseCount = 0;
    try {
        const row = await db.one("SELECT COUNT(*) AS total FROM courses WHERE status = 'PUBLISHED'");
        courseCount = row ? Number(row.total) || 0 : 0;
    } catch (err) {
        courseCount = 0;
    }

    res.render('assessment', {
        user: req.user,
        subjects: subjects.SUBJECTS,
        quizzes: quizzes,
        progress: progress,
        openCount: open.length,
        courseCount: courseCount,
    });
});

/* Student progress - the mastery map of the signed-in account. */
router.get('/profile', async (req, res) => {
    if (!req.user) {
        return res.redirect('/accsetup?next=%2Fprofile');
    }

    const progress = await progressData.loadProgress(db, req.user.uid);
    res.render('profile', { user: req.user, progress });
});

/* The settings of the signed-in account. */
router.get('/settings', async (req, res) => {
    if (!req.user) {
        return res.redirect('/accsetup?next=%2Fsettings');
    }

    const progress = await progressData.loadProgress(db, req.user.uid);
    const preferences = await settings.readPreferences(db, req.user.uid);

    res.render('settings', { user: req.user, progress: progress, preferences: preferences, subjects: subjects.SUBJECTS });
});

/* Study materials - the resource catalogue of the classes. */
router.get('/materials', async (req, res) => {
    const classes = await loadClasses(req.user ? req.user.uid : 0);
    const catalogue = materialsData.buildMaterials(classes);

    res.render('materials', { user: req.user, catalogue });
});

/* Analytics - how the scores of the signed-in account are moving. */
router.get('/analytics', async (req, res) => {
    if (!req.user) {
        return res.redirect('/accsetup?next=%2Fanalytics');
    }

    const progress = await progressData.loadProgress(db, req.user.uid);
    res.render('analytics', { user: req.user, progress });
});

/* Messages - the inbox of the signed-in account. */
router.get('/messages', async (req, res) => {
    if (!req.user) {
        return res.redirect('/accsetup?next=%2Fmessages');
    }

    let messages = [];
    try {
        messages = await db.query(
            `SELECT id, subject, body, category, status, reply, created_at, replied_at
             FROM messages
             WHERE user_id = ?
             ORDER BY created_at ASC`,
            [req.user.uid]
        );
    } catch (err) {
        console.error('[messages] could not load the messages:', err.message);
    }

    res.render('messages', { user: req.user, messages: messages });
});

/* Community - still under construction. */
router.get('/community', (req, res) => {
    res.render('community', { user: req.user });
});

router.get('/quiz', (req, res) => {
    res.render('quiz', { user: req.user });
});

/* The sections of the admin portal - the title, the hint and the search. */
const ADMIN_SECTIONS = {
    dashboard: {
        title: 'Admin Overview',
        hint: 'The numbers of the platform at a glance',
        search: 'Search the portal...',
    },
    builder: {
        title: 'Exam & Quiz Builder',
        hint: 'Build an assessment and publish it to the students',
        search: 'Search a subject...',
    },    scores: {
        title: 'Student Scores',
        hint: 'Every attempt of every student',
        search: 'Search a student or an assessment...',
    },
    users: {
        title: 'User Management',
        hint: 'The accounts of QuizNova',
        search: 'Search a name or an email...',
    },
    messages: {
        title: 'Student Messages',
        hint: 'Answer the questions of the students',
        search: 'Search a message...',
    },
    settings: {
        title: 'Platform Settings',
        hint: 'The values the whole app uses',
        search: 'Search the settings...',
    },
    account: {
        title: 'My Account',
        hint: 'Your account, the platform and the last activity',
        // There is nothing to search on this page.
        search: false,
    },
    courses: {
        title: 'Courses & Videos',
        hint: 'The lessons the students watch',
        search: 'Search a course or a video...',
    },
};

/* Admin portal - requires an administrator account. */
router.get('/admin', async (req, res) => {
    if (!req.user) {
        // Send them to the login page and come back here afterwards.
        return res.redirect('/accsetup?next=%2Fadmin');
    }
    if (!isAdmin(req.user)) {
        return forbidden(res, 'Your account does not have administrator access.', req.user);
    }

    const data = await loadAdminData(req.user.uid);
    res.render(
        'admin/adminportal',
        Object.assign({ user: req.user, tab: 'dashboard', subjects: subjects.SUBJECTS, section: ADMIN_SECTIONS.dashboard }, data)
    );
});

/* Every admin button has its own page. */
Object.keys(ADMIN_SECTIONS).forEach(function (tab) {
    if (tab === 'dashboard') return;

    router.get('/admin/' + tab, async (req, res) => {
        if (!req.user) {
            return res.redirect('/accsetup?next=%2Fadmin%2F' + tab);
        }
        if (!isAdmin(req.user)) {
            return forbidden(res, 'Your account does not have administrator access.', req.user);
        }

        const data = await loadAdminData(req.user.uid);
        res.render(
            'admin/adminportal',
            Object.assign(
                { user: req.user, tab: tab, subjects: subjects.SUBJECTS, section: ADMIN_SECTIONS[tab] },
                data
            )
        );
    });
});

module.exports = router;
