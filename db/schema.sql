-- QuizNova - database schema
-- Run with: npm run db:setup   (or import this file manually)

CREATE DATABASE IF NOT EXISTS `quiznova`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `quiznova`;

-- ------------------------------------------------------------------ --
-- Users
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS `users` (
    `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `full_name`     VARCHAR(120) NOT NULL,
    `username`      VARCHAR(60)  NOT NULL,
    `email`         VARCHAR(190) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role`          ENUM('student','instructor','admin') NOT NULL DEFAULT 'student',
    `subject`       VARCHAR(80)  DEFAULT NULL,
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_users_username` (`username`),
    UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ --
-- Classes + enrolment
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS `classes` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code`        VARCHAR(20)  NOT NULL,
    `title`       VARCHAR(160) NOT NULL,
    `department`  VARCHAR(80)  NOT NULL,
    `instructor`  VARCHAR(120) NOT NULL,
    `status`      ENUM('ACTIVE','COMPLETED','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `is_live`     TINYINT(1)   NOT NULL DEFAULT 0,
    `description` TEXT         DEFAULT NULL,
    `schedule`    VARCHAR(160) DEFAULT NULL,
    `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_classes_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `class_members` (
    `id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `class_id` INT UNSIGNED NOT NULL,
    `user_id`  INT UNSIGNED NOT NULL,
    `joined_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_class_user` (`class_id`,`user_id`),
    KEY `idx_members_user` (`user_id`),
    CONSTRAINT `fk_members_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_members_user`  FOREIGN KEY (`user_id`)  REFERENCES `users` (`id`)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ --
-- Quizzes + questions
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS `quizzes` (
    `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `class_id`         INT UNSIGNED DEFAULT NULL,
    `slug`             VARCHAR(80)  NOT NULL,
    `title`            VARCHAR(160) NOT NULL,
    `subject`          VARCHAR(80)  NOT NULL,
    `type`             ENUM('QUIZ','ASSIGNMENT','MIDTERM','MOCK') NOT NULL DEFAULT 'QUIZ',
    `status`           ENUM('DRAFT','UPCOMING','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `duration_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 20,
    `total_questions`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `points_per_question` SMALLINT UNSIGNED NOT NULL DEFAULT 10,
    `instructions`     TEXT DEFAULT NULL,
    `created_by`       INT UNSIGNED DEFAULT NULL,
    `published_at`     TIMESTAMP NULL DEFAULT NULL,
    `due_at`           DATETIME DEFAULT NULL,
    `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_quizzes_slug` (`slug`),
    KEY `idx_quizzes_class` (`class_id`),
    KEY `idx_quizzes_subject` (`subject`),
    CONSTRAINT `fk_quizzes_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_quizzes_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `questions` (
    `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `quiz_id`       INT UNSIGNED NOT NULL,
    `position`      SMALLINT UNSIGNED NOT NULL,
    `prompt`        TEXT NOT NULL,
    `code_snippet`  TEXT DEFAULT NULL,
    `option_a`      VARCHAR(255) NOT NULL DEFAULT '',
    `option_b`      VARCHAR(255) NOT NULL DEFAULT '',
    `option_c`      VARCHAR(255) NOT NULL DEFAULT '',
    `option_d`      VARCHAR(255) NOT NULL DEFAULT '',
    `option_e`      VARCHAR(255) NOT NULL DEFAULT '',
    `correct_option` CHAR(1) NOT NULL DEFAULT '',
    `question_type` ENUM('MCQ','TRUE_FALSE') NOT NULL DEFAULT 'MCQ',
    `explanation`   TEXT DEFAULT NULL,
    `points`        SMALLINT UNSIGNED NOT NULL DEFAULT 10,
    PRIMARY KEY (`id`),
    KEY `idx_questions_quiz` (`quiz_id`,`position`),
    CONSTRAINT `fk_questions_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ --
-- The settings of a subject (how many questions it gets)
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS `subject_settings` (
    `subject`             VARCHAR(80) NOT NULL,
    `question_count`      SMALLINT UNSIGNED NOT NULL DEFAULT 10,
    `option_count`        TINYINT UNSIGNED NOT NULL DEFAULT 4,
    `duration_minutes`    SMALLINT UNSIGNED NOT NULL DEFAULT 20,
    `points_per_question` SMALLINT UNSIGNED NOT NULL DEFAULT 10,
    `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`subject`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ --
-- The courses of the platform and the videos of a course
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS `courses` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `class_id`    INT UNSIGNED DEFAULT NULL,
    `slug`        VARCHAR(90)  NOT NULL,
    `title`       VARCHAR(160) NOT NULL,
    `subject`     VARCHAR(80)  NOT NULL DEFAULT 'General',
    `description` TEXT DEFAULT NULL,
    `instructor`  VARCHAR(120) DEFAULT NULL,
    `status`      ENUM('DRAFT','PUBLISHED','COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `position`    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `created_by`  INT UNSIGNED DEFAULT NULL,
    `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_courses_slug` (`slug`),
    KEY `idx_courses_subject` (`subject`),
    CONSTRAINT `fk_courses_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_courses_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `course_videos` (
    `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `course_id`        INT UNSIGNED NOT NULL,
    `position`         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `title`            VARCHAR(160) NOT NULL,
    `description`      TEXT DEFAULT NULL,
    `provider`         ENUM('LINK','FILE','YOUTUBE','VIMEO') NOT NULL DEFAULT 'LINK',
    `url`              VARCHAR(500) DEFAULT NULL,
    `file_path`        VARCHAR(255) DEFAULT NULL,
    `file_name`        VARCHAR(255) DEFAULT NULL,
    `file_size`        INT UNSIGNED NOT NULL DEFAULT 0,
    `duration_seconds` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_course_videos_course` (`course_id`,`position`),
    CONSTRAINT `fk_course_videos_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ --
-- What a student watched and what is done
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS `lesson_progress` (
    `user_id`          INT UNSIGNED NOT NULL,
    `video_id`         INT UNSIGNED NOT NULL,
    `course_id`        INT UNSIGNED NOT NULL,
    `position_seconds` INT UNSIGNED NOT NULL DEFAULT 0,
    `completed`        TINYINT(1) NOT NULL DEFAULT 0,
    `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`,`video_id`),
    KEY `idx_lesson_progress_course` (`user_id`,`course_id`),
    CONSTRAINT `fk_lesson_progress_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_lesson_progress_video` FOREIGN KEY (`video_id`) REFERENCES `course_videos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ --
-- Messages (student -> admin support inbox)
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS `messages` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`     INT UNSIGNED NOT NULL,
    `subject`     VARCHAR(160) NOT NULL,
    `body`        TEXT NOT NULL,
    `category`    ENUM('support','academic','account','other') NOT NULL DEFAULT 'support',
    `status`      ENUM('open','answered','closed') NOT NULL DEFAULT 'open',
    `reply`       TEXT DEFAULT NULL,
    `replied_by`  INT UNSIGNED DEFAULT NULL,
    `replied_at`  TIMESTAMP NULL,
    `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_messages_user` (`user_id`),
    KEY `idx_messages_status` (`status`),
    CONSTRAINT `fk_messages_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_messages_reply` FOREIGN KEY (`replied_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ --
-- Platform settings (key / value)
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS `settings` (
    `setting_key`   VARCHAR(60) NOT NULL,
    `setting_value` VARCHAR(255) NOT NULL,
    `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ --
-- Attempts
-- ------------------------------------------------------------------ --
CREATE TABLE IF NOT EXISTS `attempts` (
    `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`           INT UNSIGNED NOT NULL,
    `quiz_id`           INT UNSIGNED NOT NULL,
    `score`             DECIMAL(5,2) NOT NULL DEFAULT 0,
    `correct_count`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `total_questions`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `answers`           JSON DEFAULT NULL,
    `time_spent_seconds` INT UNSIGNED NOT NULL DEFAULT 0,
    `submitted_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_attempts_user` (`user_id`),
    KEY `idx_attempts_quiz` (`quiz_id`),
    CONSTRAINT `fk_attempts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_attempts_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
