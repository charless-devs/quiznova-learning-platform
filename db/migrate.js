'use strict';

/**
 * QuizNova - database migrations.
 *
 * The schema of db/schema.sql describes a fresh database. This file brings an
 * *existing* database up to that schema: it adds the columns of the exam
 * builder, the new status of a quiz and the table with the settings of a
 * subject.
 *
 * It is safe to run again and again - every step checks whether it is needed.
 *
 *   npm run db:migrate
 */

const mysql = require('mysql2/promise');

const { db } = require('../config');
const subjects = require('../data/subjects');

/* ------------------------------------------------------------------ */
/* The steps                                                           */
/* ------------------------------------------------------------------ */

/** The columns that the exam builder needs. */
const COLUMNS = [
    { table: 'questions', column: 'option_e', definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
    { table: 'questions', column: 'question_type', definition: "ENUM('MCQ','TRUE_FALSE') NOT NULL DEFAULT 'MCQ'" },
    { table: 'questions', column: 'explanation', definition: 'TEXT DEFAULT NULL' },
    { table: 'quizzes', column: 'points_per_question', definition: 'SMALLINT UNSIGNED NOT NULL DEFAULT 10' },
    { table: 'quizzes', column: 'instructions', definition: 'TEXT DEFAULT NULL' },
    { table: 'quizzes', column: 'created_by', definition: 'INT UNSIGNED DEFAULT NULL' },
    { table: 'quizzes', column: 'published_at', definition: 'TIMESTAMP NULL DEFAULT NULL' },
];

/** The tables that the exam builder needs. */
const TABLES = [
    {
        name: "subject_settings",
        sql: `CREATE TABLE IF NOT EXISTS \`subject_settings\` (
        \`subject\`             VARCHAR(80) NOT NULL,
        \`question_count\`      SMALLINT UNSIGNED NOT NULL DEFAULT 10,
        \`option_count\`        TINYINT UNSIGNED NOT NULL DEFAULT 4,
        \`duration_minutes\`    SMALLINT UNSIGNED NOT NULL DEFAULT 20,
        \`points_per_question\` SMALLINT UNSIGNED NOT NULL DEFAULT 10,
        \`updated_at\`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`subject\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
        name: "courses",
        sql: `CREATE TABLE IF NOT EXISTS \`courses\` (
        \`id\`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`class_id\`    INT UNSIGNED DEFAULT NULL,
        \`slug\`        VARCHAR(90)  NOT NULL,
        \`title\`       VARCHAR(160) NOT NULL,
        \`subject\`     VARCHAR(80)  NOT NULL DEFAULT 'General',
        \`description\` TEXT DEFAULT NULL,
        \`instructor\`  VARCHAR(120) DEFAULT NULL,
        \`status\`      ENUM('DRAFT','PUBLISHED','COMPLETED') NOT NULL DEFAULT 'DRAFT',
        \`position\`    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        \`created_by\`  INT UNSIGNED DEFAULT NULL,
        \`created_at\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_courses_slug\` (\`slug\`),
        KEY \`idx_courses_subject\` (\`subject\`),
        CONSTRAINT \`fk_courses_class\` FOREIGN KEY (\`class_id\`) REFERENCES \`classes\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_courses_creator\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
        name: "course_videos",
        sql: `CREATE TABLE IF NOT EXISTS \`course_videos\` (
        \`id\`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`course_id\`        INT UNSIGNED NOT NULL,
        \`position\`         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        \`title\`            VARCHAR(160) NOT NULL,
        \`description\`      TEXT DEFAULT NULL,
        \`provider\`         ENUM('LINK','FILE','YOUTUBE','VIMEO') NOT NULL DEFAULT 'LINK',
        \`url\`              VARCHAR(500) DEFAULT NULL,
        \`file_path\`        VARCHAR(255) DEFAULT NULL,
        \`file_name\`        VARCHAR(255) DEFAULT NULL,
        \`file_size\`        INT UNSIGNED NOT NULL DEFAULT 0,
        \`duration_seconds\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`created_at\`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_course_videos_course\` (\`course_id\`,\`position\`),
        CONSTRAINT \`fk_course_videos_course\` FOREIGN KEY (\`course_id\`) REFERENCES \`courses\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
        name: 'lesson_progress',
        sql: `CREATE TABLE IF NOT EXISTS \`lesson_progress\` (
        \`user_id\`          INT UNSIGNED NOT NULL,
        \`video_id\`         INT UNSIGNED NOT NULL,
        \`course_id\`        INT UNSIGNED NOT NULL,
        \`position_seconds\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`completed\`        TINYINT(1) NOT NULL DEFAULT 0,
        \`updated_at\`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`user_id\`,\`video_id\`),
        KEY \`idx_lesson_progress_course\` (\`user_id\`,\`course_id\`),
        CONSTRAINT \`fk_lesson_progress_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_lesson_progress_video\` FOREIGN KEY (\`video_id\`) REFERENCES \`course_videos\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
];

/* ------------------------------------------------------------------ */
/* The helpers                                                         */
/* ------------------------------------------------------------------ */

/** Does the table have the column? */
async function hasColumn(runner, table, column) {
    const [rows] = await runner.query(
        `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );

    return Number(rows[0].total) > 0;
}

/** Does the table have the foreign key? */
async function hasConstraint(runner, table, constraint) {
    const [rows] = await runner.query(
        `SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
        [table, constraint]
    );

    return Number(rows[0].total) > 0;
}

/** Does the table have the index? */
async function hasIndex(runner, table, index) {
    const [rows] = await runner.query(
        `SELECT COUNT(*) AS total FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, index]
    );

    return Number(rows[0].total) > 0;
}

/* ------------------------------------------------------------------ */
/* The migration                                                       */
/* ------------------------------------------------------------------ */

/**
 * Brings the database up to the schema of db/schema.sql.
 *
 * @param {object} runner  anything with a query() method (a pool or a connection)
 * @param {function} log   optional logger
 * @returns {Promise<string[]>} the steps that were carried out
 */
async function migrate(runner, log) {
    const say = typeof log === 'function' ? log : () => {};
    const done = [];

    // 1. The tables of the exam builder and of the courses.
    for (const table of TABLES) {
        await runner.query(table.sql);
        done.push('table ' + table.name);
    }

    // 2. The columns of the exam builder.
    for (const item of COLUMNS) {
        if (await hasColumn(runner, item.table, item.column)) continue;
        await runner.query(`ALTER TABLE \`${item.table}\` ADD COLUMN \`${item.column}\` ${item.definition}`);
        done.push(`${item.table}.${item.column}`);
    }

    // 3. A quiz can be a draft now.
    await runner.query(
        `ALTER TABLE \`quizzes\` MODIFY COLUMN \`status\`
         ENUM('DRAFT','UPCOMING','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'DRAFT'`
    );
    done.push('quizzes.status');

    // 4. The index and the foreign key of the creator.
    if (!(await hasIndex(runner, 'quizzes', 'idx_quizzes_subject'))) {
        await runner.query('ALTER TABLE `quizzes` ADD KEY `idx_quizzes_subject` (`subject`)');
        done.push('quizzes.idx_quizzes_subject');
    }

    if (!(await hasConstraint(runner, 'quizzes', 'fk_quizzes_creator'))) {
        await runner.query(
            'ALTER TABLE `quizzes` ADD CONSTRAINT `fk_quizzes_creator` ' +
                'FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL'
        );
        done.push('quizzes.fk_quizzes_creator');
    }

    // 5. Every subject gets its row with the number of questions.
    for (const subject of subjects.SUBJECTS) {
        await runner.query(
            `INSERT INTO \`subject_settings\` (\`subject\`) VALUES (?) ON DUPLICATE KEY UPDATE \`subject\` = \`subject\``,
            [subject.name]
        );
    }
    done.push('subject_settings rows');

    say('Database updated.');
    return done;
}

/* ------------------------------------------------------------------ */
/* The command line                                                    */
/* ------------------------------------------------------------------ */

async function main() {
    console.log('QuizNova database migration');
    console.log('---------------------------');
    console.log(`Host     : ${db.host}:${db.port}`);
    console.log(`Database : ${db.database}\n`);

    let connection;

    try {
        connection = await mysql.createConnection({
            host: db.host,
            port: db.port,
            user: db.user,
            password: db.password,
            database: db.database,
            charset: 'utf8mb4',
        });
    } catch (err) {
        console.error('! Could not connect to MySQL.');
        console.error(`  ${err.code || ''} ${err.message}`);
        console.error('\n  - Is the MySQL service running?  (net start MySQL80)');
        console.error('  - Are DB_HOST / DB_USER / DB_PASSWORD correct?\n');
        process.exit(1);
    }

    try {
        const steps = await migrate(connection);
        console.log('  Steps:');
        steps.forEach((step) => console.log('    - ' + step));
        console.log('\n  Done. The exam builder and the courses can now work.\n');
    } catch (err) {
        console.error('\n! The migration failed:', err.message);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    main();
}

module.exports = { migrate, COLUMNS, TABLES };
