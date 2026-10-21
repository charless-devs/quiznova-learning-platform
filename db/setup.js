'use strict';

/**
 * QuizNova - database setup.
 *
 * Creates the database, applies the schema and seeds the demo content.
 * Safe to run more than once (everything is idempotent).
 *
 *   npm run db:setup
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const { db } = require('../config');
const { hashPassword } = require('../utils/password');
const { migrate } = require('./migrate');
const bank = require('../data/questionBank');
const subjects = require('../data/subjects');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/** Split a SQL file into individual statements (no stored procedures used). */
function splitStatements(sql) {
    return sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
}

async function connect(overrides = {}) {
    return mysql.createConnection({
        host: db.host,
        port: db.port,
        user: db.user,
        password: db.password,
        multipleStatements: false,
        charset: 'utf8mb4',
        ...overrides,
    });
}

async function main() {
    console.log('QuizNova database setup');
    console.log('-----------------------');
    console.log(`Host     : ${db.host}:${db.port}`);
    console.log(`User     : ${db.user}`);
    console.log(`Database : ${db.database}\n`);

    // 1. Connect without selecting a database so we can create it.
    let connection;
    try {
        connection = await connect();
    } catch (err) {
        console.error('! Could not connect to MySQL.');
        console.error(`  ${err.code || ''} ${err.message}`);
        console.error('\n  - Is the MySQL service running?  (net start MySQL80)');
        console.error('  - Are DB_HOST / DB_USER / DB_PASSWORD correct?');
        console.error('  - Is the password in your .env file?\n');
        process.exit(1);
    }

    console.log('1/6  Creating database...');
    await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    // Select it so the schema statements below run inside the new database.
    await connection.query(`USE \`${db.database}\``);

    // 2. Apply the schema.
    console.log('2/6  Applying schema...');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    for (const statement of splitStatements(schema)) {
        const sql = statement.replace(/USE\s+`?[a-zA-Z0-9_]+`?;?/i, '').trim();
        if (!sql) continue;
        await connection.query(sql);
    }

    // 2b. Bring an older database up to the current schema (the columns of
    //     the exam builder, the draft status and the subject settings).
    await migrate(connection);
    console.log('     - the schema is up to date');
    await connection.end();

    // 3. Reconnect with the database selected for seeding.
    connection = await connect({ database: db.database });

    console.log('3/6  Seeding demo content...');

    for (const item of bank.classes) {
        await connection.query(
            `INSERT INTO classes (code, title, department, instructor, status, is_live, description, schedule)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                title = VALUES(title), department = VALUES(department), instructor = VALUES(instructor),
                status = VALUES(status), is_live = VALUES(is_live), description = VALUES(description),
                schedule = VALUES(schedule)`,
            [
                item.code,
                item.title,
                item.department,
                item.instructor,
                item.status,
                item.isLive,
                item.description,
                item.schedule,
            ]
        );
    }
    console.log(`     - ${bank.classes.length} classes`);

    // Every subject gets the number of questions it gets by default.
    for (const subject of subjects.SUBJECTS) {
        await connection.query(
            `INSERT INTO subject_settings (subject) VALUES (?)
             ON DUPLICATE KEY UPDATE subject = subject`,
            [subject.name]
        );
    }
    console.log(`     - ${subjects.SUBJECTS.length} subjects with their question settings`);

    const classIds = {};
    const [classRows] = await connection.query('SELECT id, code FROM classes');
    classRows.forEach((row) => {
        classIds[row.code] = row.id;
    });

    // The RAPIDHUNT coding assessment lives in its own quiz.
    await connection.query(
        `INSERT INTO quizzes (class_id, slug, title, subject, type, status, duration_minutes, total_questions)
         VALUES (?, 'rapidhunt-live-coding', 'RAPIDHUNT - Live Coding Assessment', 'C Programming', 'MOCK', 'IN_PROGRESS', 30, ?)
         ON DUPLICATE KEY UPDATE total_questions = VALUES(total_questions), duration_minutes = VALUES(duration_minutes)`,
        [classIds.CS101 || null, bank.rapidhunt.length]
    );

    for (const assessment of bank.assessments) {
        await connection.query(
            `INSERT INTO quizzes (class_id, slug, title, subject, type, status, duration_minutes, total_questions)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                title = VALUES(title), subject = VALUES(subject), type = VALUES(type),
                status = VALUES(status), duration_minutes = VALUES(duration_minutes),
                total_questions = VALUES(total_questions)`,
            [
                classIds[assessment.classCode] || null,
                assessment.slug,
                assessment.title,
                assessment.subject,
                assessment.type,
                assessment.status,
                assessment.durationMinutes,
                assessment.questions.length,
            ]
        );
    }
    console.log(`     - ${bank.assessments.length + 1} quizzes`);

    // Questions: RAPIDHUNT (C) + one set per assessment.
    const insertQuestion = (quizSlug, question, position) =>
        connection.query(
            `INSERT INTO questions (quiz_id, position, prompt, code_snippet, option_a, option_b, option_c, option_d, correct_option, points)
             SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, 10 FROM quizzes WHERE slug = ? LIMIT 1`,
            [
                position,
                question.prompt,
                question.code || null,
                question.options[0],
                question.options[1],
                question.options[2],
                question.options[3],
                question.correct,
                quizSlug,
            ]
        );

    // The questions of the RAPIDHUNT assessment are replaced on every run so
    // they never pile up.
    await connection.query(
        `DELETE FROM questions WHERE quiz_id = (SELECT id FROM quizzes WHERE slug = 'rapidhunt-live-coding')`
    );

    for (const question of bank.rapidhunt) {
        await insertQuestion('rapidhunt-live-coding', question, question.id);
    }

    for (const assessment of bank.assessments) {
        await connection.query(
            'DELETE FROM questions WHERE quiz_id = (SELECT id FROM quizzes WHERE slug = ?)',
            [assessment.slug]
        );
        for (const question of assessment.questions) {
            await insertQuestion(assessment.slug, question, question.id);
        }
    }
    console.log(
        `     - ${bank.rapidhunt.length + bank.assessments.length * bank.assessments[0].questions.length} questions`
    );

    // 4. The demo courses with their videos.
    console.log('4/6  Seeding the demo courses...');

    const demoCourses = [
        {
            title: 'Algebra Basics',
            subject: 'Mathematics',
            instructor: 'Jiraiya Sensei',
            description: 'The first steps with equations, functions and graphs.',
            status: 'PUBLISHED',
            videos: [
                {
                    title: 'Lesson 1: What is an equation?',
                    description: 'The beginning of the algebra.',
                    url: 'https://www.youtube.com/watch?v=aircAruvnKk',
                    seconds: 600,
                },
                {
                    title: 'Lesson 2: Functions in a nutshell',
                    description: 'How a function takes one value and gives another.',
                    url: 'https://www.youtube.com/watch?v=kfGI8cy2zZ4',
                    seconds: 720,
                },
            ],
        },
        {
            title: 'Python & Algorithms',
            subject: 'Computer Science',
            instructor: 'Kakashi Hatake',
            description: 'Write real code: the loops, the lists and the first algorithms.',
            status: 'PUBLISHED',
            videos: [
                {
                    title: 'Lesson 1: Python in 100 seconds',
                    description: 'The quickest way into the language.',
                    url: 'https://www.youtube.com/watch?v=rfscVS0vtbw',
                    seconds: 120,
                },
                {
                    title: 'Lesson 2: The binary search',
                    description: 'Find a value in a sorted list in a handful of steps.',
                    url: 'https://www.youtube.com/watch?v=RU4U6U-gC_k',
                    seconds: 900,
                },
                {
                    title: 'Lesson 3: Sorting without fear',
                    description: 'Bubble, selection and insertion sort.',
                    url: 'https://www.youtube.com/watch?v=GP9hcFdbPy8',
                    seconds: 840,
                },
            ],
        },
        {
            title: 'Design Thinking',
            subject: 'Graphic Design',
            instructor: 'Hiruzen Sarutobi',
            description: 'From the first sketch to the finished interface.',
            status: 'DRAFT',
            videos: [
                {
                    title: 'Lesson 1: The five steps of the method',
                    description: 'Empathise, define, ideate, prototype, test.',
                    url: 'https://www.youtube.com/watch?v=_r0VX-aU_T8',
                    seconds: 660,
                },
            ],
        },
    ];

    for (let index = 0; index < demoCourses.length; index += 1) {
        const course = demoCourses[index];
        const slug =
            course.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') + '-demo';

        await connection.query(
            `INSERT INTO courses (slug, title, subject, description, instructor, status, position)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                subject = VALUES(subject),
                description = VALUES(description),
                instructor = VALUES(instructor),
                status = VALUES(status),
                position = VALUES(position)`,
            [
                slug,
                course.title,
                course.subject,
                course.description,
                course.instructor,
                course.status,
                index + 1,
            ]
        );

        const [courseRows] = await connection.query('SELECT id FROM courses WHERE slug = ? LIMIT 1', [slug]);
        const courseId = courseRows[0].id;

        // The videos of a demo course are replaced on every run.
        await connection.query('DELETE FROM course_videos WHERE course_id = ?', [courseId]);

        for (let position = 0; position < course.videos.length; position += 1) {
            const video = course.videos[position];

            await connection.query(
                `INSERT INTO course_videos (course_id, position, title, description, provider, url, duration_seconds)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [courseId, position + 1, video.title, video.description, 'YOUTUBE', video.url, video.seconds]
            );
        }
    }

    console.log(`     - ${demoCourses.length} courses with their videos`);

    // 5. Demo users.
    console.log('5/6  Seeding demo users...');

    const demoUsers = [
        { full_name: 'Charles Admin', username: 'admin', email: 'admin@quiznova.edu', role: 'admin', subject: 'General' },
        { full_name: 'Alex Morgan', username: 'alex', email: 'alex.morgan@example.com', role: 'student', subject: 'Computer Science' },
        { full_name: 'Maria Santos', username: 'maria', email: 'maria.santos@example.com', role: 'instructor', subject: 'Mathematics' },
    ];

    for (const user of demoUsers) {
        const [existing] = await connection.query('SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1', [
            user.email,
            user.username,
        ]);

        if (existing.length) {
            await connection.query('UPDATE users SET role = ? WHERE id = ?', [user.role, existing[0].id]);
            continue;
        }

        const hash = await hashPassword('quiznova123');
        await connection.query(
            'INSERT INTO users (full_name, username, email, password_hash, role, subject) VALUES (?, ?, ?, ?, ?, ?)',
            [user.full_name, user.username, user.email, hash, user.role, user.subject]
        );
    }
    console.log('     - 3 demo users (password: quiznova123 for accounts created now)');

    // 6. Demo attempts so the progress page has something to show.
    console.log('6/6  Seeding demo attempts...');

    const userIds = {};
    const [userRows] = await connection.query('SELECT id, username FROM users');
    userRows.forEach((row) => {
        userIds[row.username] = row.id;
    });

    const quizIds = {};
    const [quizRows] = await connection.query('SELECT id, slug FROM quizzes');
    quizRows.forEach((row) => {
        quizIds[row.slug] = row.id;
    });

    let seeded = 0;

    // Start from a clean slate so the trend does not pile up on every run.
    // Only the demo rows are removed (they carry an empty answer list) so a
    // real attempt of a student is never touched.
    const demoUserIds = Object.values(userIds).filter((id) => id);
    if (demoUserIds.length) {
        await connection.query(
            "DELETE FROM attempts WHERE user_id IN (?) AND answers = '[]'",
            [demoUserIds]
        );
    }

    for (const attempt of bank.attempts) {
        const userId = userIds[attempt.user];
        const quizId = quizIds[attempt.slug];
        if (!userId || !quizId) continue;

        const submittedAt = new Date();
        submittedAt.setDate(submittedAt.getDate() - attempt.daysAgo);
        submittedAt.setHours(9 + (seeded % 8), (seeded * 17) % 60, 0, 0);

        // The demo attempts are replaced on every run so the trend stays fresh.
        await connection.query(
            `INSERT INTO attempts (user_id, quiz_id, score, correct_count, total_questions, answers, time_spent_seconds, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                quizId,
                attempt.score.toFixed(2),
                attempt.correct,
                attempt.total,
                JSON.stringify([]),
                attempt.seconds,
                submittedAt,
            ]
        );
        seeded += 1;
    }
    console.log(`     - ${seeded} demo attempts`);

    await connection.end();

    console.log('\nDone. Start the app with:  npm start');
    console.log('Demo accounts:');
    console.log('  admin@quiznova.edu        (admin)');
    console.log('  alex.morgan@example.com   (student)');
    console.log('  maria.santos@example.com  (instructor)');
    console.log('  New accounts use the password: quiznova123');
    console.log('  Existing accounts keep their own password - reset one with:');
    console.log('  npm run db:password -- <email-or-username> --generate\n');
}

main().catch((err) => {
    console.error('\n! Setup failed:', err.code || '', err.message);
    process.exit(1);
});
