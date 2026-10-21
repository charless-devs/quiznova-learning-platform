# QuizNova — Database Setup Guide

Everything you need to get the database running and sign in, whether you use
**XAMPP (MariaDB)** or a standalone **MySQL 8** install.

> This guide describes the setup that is running on this machine: XAMPP's
> MariaDB on `localhost:3306`, database `quiznova`, app on port `3000`.

---

## TL;DR

```bash
# 1. start the database (XAMPP Control Panel -> MySQL -> Start)
# 2. install the app
npm install
# 3. create + seed the database
npm run db:setup
# 4. run it
npm start
```

Open <http://localhost:3000> and sign in at `/accsetup`:

| Email | Password | Role | Lands on |
|---|---|---|---|
| `admin@quiznova.edu` | `G4MPMDfNXWn8dY9SYhxdGesR` | admin | `/admin` (admin portal) |

> **Before the app goes online:** these demo accounts are public - everybody
> who reads this file knows their password. Change the password of the
> administrator and set a **new** `SESSION_SECRET` in your `.env`.
| `alex.morgan@example.com` | `quiznova123` | student | `/dashboard` |
| `maria.santos@example.com` | `quiznova123` | instructor | `/dashboard` |

> The admin password was changed after the initial seed. **New accounts** created
> by `npm run db:setup` still use `quiznova123`; existing accounts keep the
> password they already have. Change any password with
> `npm run db:password -- <email-or-username> --generate`.

---

## 1. Pick your database server

QuizNova supports both, because the app uses **mysql2**, which speaks the
authentication methods of both.

| | XAMPP (MariaDB 10.4) | MySQL 8 (Windows service) |
|---|---|---|
| Where | `C:\xampp` | `C:\Program Files\MySQL\MySQL Server 8.0` |
| Port | 3306 | 3306 |
| User / password | `root` / *(empty)* | `root` / *(whatever you set)* |
| Start it | XAMPP Control Panel → **Start** | `net start MySQL80` |
| Client | `C:\xampp\mysql\bin\mysql.exe` | `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe` |

> ### ⚠️ They cannot run at the same time
> Both want **port 3306**. Only one server can bind it.
>
> ```bash
> net stop MySQL80      # stop the Windows service (Admin PowerShell)
> ```
>
> If you prefer a different port, change `port=3306` in
> `C:\xampp\mysql\bin\my.ini` and set the same value in `DB_PORT`.

---

## 2. Start the database server

**XAMPP**

1. Open `C:\xampp\xampp-control.exe`
2. Click **Start** next to **MySQL**
3. The row turns green and shows a port number — you're done.

**MySQL 8 (service)**

```powershell
# Admin PowerShell
net start MySQL80
```

**Verify it's up**

```bash
# XAMPP
C:\xampp\mysql\bin\mysql.exe -u root -e "SELECT VERSION();"

# MySQL 8
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p -e "SELECT VERSION();"
```

You should see a version string and not an error.

---

## 3. Point the app at the database

The app reads a `.env` file in the project root (already created for you).

```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=quiznova
DB_POOL_SIZE=10

SESSION_SECRET=change-me-to-a-long-random-string
```

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | The port the app listens on. |
| `DB_HOST` | `localhost` | Server address. `localhost` for XAMPP on the same PC. |
| `DB_PORT` | `3306` | Must match the server's port. |
| `DB_USER` | `root` | The MySQL user. |
| `DB_PASSWORD` | *(empty)* | Leave empty for a default XAMPP install. |
| `DB_NAME` | `quiznova` | The database the app uses. |
| `DB_POOL_SIZE` | `10` | Max simultaneous connections. |
| `SESSION_SECRET` | *(generated)* | Signs the login cookie. Change it for anything real. |

> **Change `SESSION_SECRET` for a fresh install.** Generate one with:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## 4. Create and seed the database

```bash
npm run db:setup
```

This is **idempotent** — run it as many times as you like, it never duplicates
rows.

```
QuizNova database setup
-----------------------
Host     : localhost:3306
User     : root
Database : quiznova

1/6  Creating database...
2/6  Applying schema...
     - the schema is up to date
3/6  Seeding demo content...
     - 6 classes
     - 34 subjects with their question settings
     - 6 quizzes
     - 49 questions
4/6  Seeding the demo courses...
     - 3 courses with their videos
5/6  Seeding demo users...
     - 3 demo users (password: quiznova123 for accounts created now)
6/6  Seeding demo attempts...
     - 10 demo attempts

Done. Start the app with:  npm start
```

What it does:

1. Connects **without** selecting a database, then runs
   `CREATE DATABASE IF NOT EXISTS quiznova` (utf8mb4).
2. Applies every statement in `db/schema.sql` — all `CREATE TABLE IF NOT EXISTS`,
   so existing tables are left alone.
3. Runs the **migration** (`db/migrate.js`), so an older database gets the
   columns of the exam builder, the `DRAFT` status of a quiz, the table
   `subject_settings` and the tables `courses` + `course_videos`.
4. Seeds the demo content from `data/questionBank.js`
   (6 classes, 6 quizzes, 49 questions).
5. Creates the 3 demo users with **scrypt-hashed** passwords. An account that
   already exists is only re-synced on its **role** — its password is left
   untouched, so re-running the setup never resets a changed password.
6. Seeds the **demo attempts** of the last 7 days, so the progress page
   (`/profile`) has a mastery map to show right away. Only these demo rows
   are replaced on a re-run — a real attempt of a student is never touched.

### An older database?

If your database was created before the exam builder existed, update it
without touching your data:

```bash
npm run db:migrate
```

The migration only **adds** what is missing (the columns of the builder, the
`DRAFT` status, the table `subject_settings`) and fills the settings of every
subject. It is safe to run again and again — nothing is ever dropped.

---

## 5. Accounts, roles and where you land

The `users.role` column decides what an account may open and which page it
lands on after signing in:

| Role | Lands on | Can open |
|---|---|---|
| `admin` | `/admin` — the admin portal | the portal and the student pages (they stay where they are) |
| `student` | `/dashboard` — the student app | the student pages |
| `instructor` | `/dashboard` — the student app | the student pages |

* The login API returns the target page, so the browser always follows the
  correct one — no second click.
* A `?next=` hint is still honoured when the role may open it:
  `/accsetup?next=%2Fadmin` brings an administrator back to the portal, while
  a student is sent to `/dashboard` instead of the 403 page.
* A signed-in student who types `/admin` gets a **403** page with a link back
  to the dashboard. An **Admin Portal** link appears in the sidebar of the
  dashboard, classes and assessment pages for administrators.

### Changing a password

Passwords are hashed with scrypt, so a password can only be changed from Node
(not with plain SQL):

```bash
# set a password you choose
npm run db:password -- admin@quiznova.edu "MyNewPassword1!"

# or let the script generate a strong random one and print it
npm run db:password -- admin@quiznova.edu --generate
```

```
  Charles Admin (admin@quiznova.edu)
  role   : admin
  password updated.

  New password: G4MPMDfNXWn8dY9SYhxdGesR
```

The account is found by **email or username**, so
`npm run db:password -- admin --generate` works too. Sign out and back in
afterwards — sessions keep working, but the new password is needed next time.

### Making an account an administrator

```bash
npm run db:promote -- your.email@example.com           # -> admin
npm run db:promote -- your.email@example.com student   # back to a normal user
```

Sign out and back in afterwards so the new role is picked up.

---

## 6. Verify

**In phpMyAdmin** — <http://localhost/phpmyadmin>

1. Click the **`quiznova`** database in the left sidebar
2. You should see: `attempts`, `class_members`, `classes`, `course_videos`, `courses`, `messages`, `questions`, `quizzes`, `settings`, `subject_settings`, `users`
3. Open the **users** tab → 3 rows

**From the command line**

```bash
C:\xampp\mysql\bin\mysql.exe -u root -e "USE quiznova; SELECT username, email, role FROM users; SELECT COUNT(*) AS questions FROM questions;"
```

**From the app** — start it and watch the console:

```
  QuizNova is running at http://localhost:3000

  [db] connected to MySQL (quiznova)
```

If you see `[db] MySQL is not reachable - running in demo mode.` instead, the
app could not connect — see the troubleshooting table below.

**Smoke test the API**

```bash
curl http://localhost:3000/api/classes
```

```json
{ "ok": true, "source": "db", "classes": [ { "code": "CS101", ... } ] }
```

`"source": "db"` means it read from MySQL. `"source": "bundled"` means it fell
back to the built-in demo data because the database was unreachable.

**Smoke test the login**

```bash
curl -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"identifier\":\"admin@quiznova.edu\",\"password\":\"G4MPMDfNXWn8dY9SYhxdGesR\"}"
```

The answer contains the page the browser is sent to:

```json
{ "ok": true, "user": { "role": "admin", ... }, "redirectTo": "/admin" }
```

`redirectTo` is `/admin` for an administrator and `/dashboard` for every other
role.

---

## 7. Doing it manually with phpMyAdmin

If you'd rather not use the setup script:

1. phpMyAdmin → **Import** tab
2. Choose `db/schema.sql` → **Go** (this creates the database and the tables)
3. Then run `npm run db:setup` to fill it with demo content
   (the schema step will just be a no-op, the seed step does the work)

---

## 8. Schema reference

```
users ──┬──< class_members >── classes ──< quizzes ──< questions
        │                          │
        ├──< attempts >────────────┘
        ├──< messages >────────────┘
        └──< settings (key/value)

subject_settings  (one row per subject: how many questions it gets)

courses ──< course_videos ──< lesson_progress  (the lessons the students watch)
```

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | INT UNSIGNED | PK, auto increment |
| `full_name` | VARCHAR(120) | |
| `username` | VARCHAR(60) | **unique** |
| `email` | VARCHAR(190) | **unique** |
| `password_hash` | VARCHAR(255) | scrypt, never the plain password |
| `role` | ENUM | `student` / `instructor` / `admin` |
| `subject` | VARCHAR(80) | Primary learning focus |
| `created_at` | TIMESTAMP | |

### `classes`
| Column | Type | Notes |
|---|---|---|
| `id` | INT UNSIGNED | PK |
| `code` | VARCHAR(20) | **unique** — the code students type to join |
| `title` / `department` / `instructor` | VARCHAR | |
| `status` | ENUM | `ACTIVE` / `COMPLETED` / `ARCHIVED` |
| `is_live` | TINYINT(1) | 1 = streaming now |
| `description` / `schedule` | TEXT / VARCHAR | |
| `created_at` | TIMESTAMP | |

### `class_members` (join table)
| Column | Notes |
|---|---|
| `class_id` | FK → `classes.id`, ON DELETE CASCADE |
| `user_id` | FK → `users.id`, ON DELETE CASCADE |
| — | `UNIQUE (class_id, user_id)` stops duplicate enrolments |

### `quizzes`
| Column | Type | Notes |
|---|---|---|
| `id` | INT UNSIGNED | PK |
| `class_id` | INT UNSIGNED | FK → `classes.id`, nullable (`ON DELETE SET NULL`) |
| `slug` | VARCHAR(80) | **unique** — the key the API uses, e.g. `rapidhunt-live-coding` |
| `title` / `subject` | VARCHAR | |
| `type` | ENUM | `QUIZ` / `ASSIGNMENT` / `MIDTERM` / `MOCK` |
| `status` | ENUM | `DRAFT` / `UPCOMING` / `IN_PROGRESS` / `COMPLETED` |
| `duration_minutes` | SMALLINT | default 20 |
| `total_questions` | SMALLINT | how many questions it has |
| `points_per_question` | SMALLINT | default 10 |
| `instructions` | TEXT | nullable |
| `created_by` | INT UNSIGNED | FK → `users.id`, nullable (`ON DELETE SET NULL`) |
| `published_at` | TIMESTAMP | nullable — when it went live |
| `due_at` | DATETIME | nullable |

### `questions`
| Column | Type | Notes |
|---|---|---|
| `id` | INT UNSIGNED | PK |
| `quiz_id` | INT UNSIGNED | FK → `quizzes.id`, ON DELETE CASCADE |
| `position` | SMALLINT | 1-based order inside the quiz |
| `prompt` | TEXT | The question text |
| `code_snippet` | TEXT | Optional code block (used by the C quiz) |
| `option_a` … `option_e` | VARCHAR(255) | Up to five choices |
| `correct_option` | CHAR(1) | The answer key: `A`–`E` |
| `question_type` | ENUM | `MCQ` / `TRUE_FALSE` |
| `explanation` | TEXT | nullable — shown after the attempt |
| `points` | SMALLINT | default 10 |

### `subject_settings`
| Column | Type | Notes |
|---|---|---|
| `subject` | VARCHAR(80) | PK — one row per subject |
| `question_count` | SMALLINT | how many questions an assessment of it gets (1–100) |
| `option_count` | TINYINT | how many answers a question has (2–5) |
| `duration_minutes` | SMALLINT | how long it may take |
| `points_per_question` | SMALLINT | the points of one question |

### `courses`
| Column | Type | Notes |
|---|---|---|
| `id` | INT UNSIGNED | PK |
| `class_id` | INT UNSIGNED | FK → `classes.id`, nullable |
| `slug` | VARCHAR(90) | **unique** — the address of the course |
| `title` / `subject` / `instructor` | VARCHAR | |
| `description` | TEXT | nullable |
| `status` | ENUM | `DRAFT` / `PUBLISHED` / `COMPLETED` — only `PUBLISHED` is in the student portal |
| `position` | SMALLINT | the order of the courses |
| `created_by` | INT UNSIGNED | FK → `users.id`, nullable |

### `course_videos`
| Column | Type | Notes |
|---|---|---|
| `id` | INT UNSIGNED | PK |
| `course_id` | INT UNSIGNED | FK → `courses.id`, ON DELETE CASCADE |
| `position` | SMALLINT | the order of the lessons |
| `title` / `description` | VARCHAR / TEXT | |
| `provider` | ENUM | `LINK` / `FILE` / `YOUTUBE` / `VIMEO` |
| `url` | VARCHAR(500) | the link of the video (nullable) |
| `file_path` | VARCHAR(255) | the uploaded file in `public/uploads/videos` (nullable) |
| `file_name` / `file_size` | VARCHAR / INT | the name and the size of the upload |
| `duration_seconds` | INT | how long the video is |

### `lesson_progress`
| Column | Type | Notes |
|---|---|---|
| `user_id` | INT UNSIGNED | PK part 1 - FK → `users.id`, ON DELETE CASCADE |
| `video_id` | INT UNSIGNED | PK part 2 - FK → `course_videos.id`, ON DELETE CASCADE |
| `course_id` | INT UNSIGNED | the course of the video |
| `position_seconds` | INT | where the student stopped the video |
| `completed` | TINYINT(1) | 1 = the lesson is done |
| `updated_at` | TIMESTAMP | when it was saved |

### `messages`
| Column | Type | Notes |
|---|---|---|
| `id` | INT UNSIGNED | PK |
| `user_id` | INT UNSIGNED | FK → `users.id`, CASCADE |
| `subject` | VARCHAR(160) | What the student wrote about |
| `body` | TEXT | The message itself |
| `category` | ENUM | `support` / `academic` / `account` / `other` |
| `status` | ENUM | `open` / `answered` / `closed` |
| `reply` | TEXT | The answer of the admin |
| `replied_by` | INT UNSIGNED | FK → `users.id` (the admin), nullable |
| `replied_at` | TIMESTAMP | nullable |
| `created_at` | TIMESTAMP | |

### `settings`
| Column | Type | Notes |
|---|---|---|
| `setting_key` | VARCHAR(60) | PK - `maintenance`, `registration_open`, `default_duration`, `passing_score` |
| `setting_value` | VARCHAR(255) | The value of the setting |
| `updated_at` | TIMESTAMP | |

### `attempts`
| Column | Type | Notes |
|---|---|---|
| `id` | INT UNSIGNED | PK |
| `user_id` | INT UNSIGNED | FK → `users.id`, CASCADE |
| `quiz_id` | INT UNSIGNED | FK → `quizzes.id`, CASCADE |
| `score` | DECIMAL(5,2) | Percentage, 0–100 |
| `correct_count` / `total_questions` | SMALLINT | |
| `answers` | JSON | `[{"position":1,"option":"A"}, ...]` |
| `time_spent_seconds` | INT UNSIGNED | |
| `submitted_at` | TIMESTAMP | |

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `[db] MySQL is not reachable` + `ECONNREFUSED` | Server isn't running | Start it in the XAMPP Control Panel (or `net start MySQL80`) |
| `Address already in use` / port 3306 | Both MySQL80 and XAMPP MariaDB running | `net stop MySQL80`, or change the port in `my.ini` + `DB_PORT` |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` | Check the credentials in `.env`; in phpMyAdmin → **User accounts** you can reset the root password |
| `ER_NOT_SUPPORTED_AUTH_MODE` | User uses an auth method the driver can't do | `ALTER USER 'root'@'localhost' IDENTIFIED BY 'yourpass';` then update `DB_PASSWORD`. This was already solved by switching to `mysql2` |
| `Database "quiznova" does not exist` | Setup never ran | `npm run db:setup` |
| `Unknown database 'quiznova'` from the client | The client needs `-D` | `mysql.exe -u root -D quiznova` or add `USE quiznova;` |
| Setup says "Could not connect to MySQL" | Wrong host/port/password | Compare `.env` with the XAMPP panel's **Port** number |
| Pages load but login fails | Server reachable, DB missing | Check the console for `[auth] login failed: ...` and run `npm run db:setup` |
| "Those credentials do not match our records" | Wrong password | Reset it with `npm run db:password -- <email-or-username> --generate` |
| Data looks stale | Seed didn't re-run | `npm run db:setup` again — it upserts (passwords are never overwritten) |
| Logged in but landed on the dashboard instead of the portal | The account's role is not `admin` | `npm run db:promote -- <email-or-username>`, then sign out and back in |
| The exam builder has no questions | The database is older than the builder | `npm run db:migrate` |

### Useful commands

```bash
# Is the port answering?
netstat -ano | findstr :3306

# Connect with XAMPP's client
C:\xampp\mysql\bin\mysql.exe -u root -e "SHOW DATABASES;"

# Which server is using 3306?
netstat -ano | findstr :3306     # then: tasklist /FI "PID eq <pid>"

# Start / stop the Windows MySQL service
net start MySQL80
net stop MySQL80
```

---

## 10. Resetting the database

**Wipe everything and start over**

```bash
C:\xampp\mysql\bin\mysql.exe -u root -e "DROP DATABASE quiznova;"
npm run db:setup
```

> This recreates the demo accounts with the password `quiznova123` — including
> the admin. Change it again afterwards with
> `npm run db:password -- admin@quiznova.edu --generate`.

**Keep the schema, clear the data**

```bash
C:\xampp\mysql\bin\mysql.exe -u root -e "USE quiznova; DELETE FROM attempts; DELETE FROM class_members;"
```

**Change a password** (the app hashes with scrypt, so this needs Node, not SQL):

```bash
npm run db:password -- alex "NewPassword1!"
npm run db:password -- admin@quiznova.edu --generate   # random, printed once
```

**Make an account an administrator** (needed to open `/admin`):

```bash
npm run db:promote -- your.email@example.com
npm run db:promote -- your.email@example.com student   # back to a normal user
```

Sign out and back in afterwards so the new role is picked up.

---

## 11. Handy queries

```sql
-- Who can open the admin portal?
SELECT id, full_name, username, email, role
FROM users
WHERE role = 'admin';

-- Top scorers
SELECT u.full_name, a.score, q.title
FROM attempts a
JOIN users u ON u.id = a.user_id
JOIN quizzes q ON q.id = a.quiz_id
ORDER BY a.score DESC;

-- Who is enrolled where
SELECT u.full_name, c.code, c.title, m.joined_at
FROM class_members m
JOIN users u ON u.id = m.user_id
JOIN classes c ON c.id = m.class_id
ORDER BY c.code;

-- Quiz with its question count
SELECT q.title, q.slug, q.status, COUNT(qu.id) AS questions
FROM quizzes q
LEFT JOIN questions qu ON qu.quiz_id = q.id
GROUP BY q.id;

-- Add a new class
INSERT INTO classes (code, title, department, instructor, status, is_live, description, schedule)
VALUES ('BIO101', 'Biology 101', 'Biology', 'Dr. Jane Doe', 'ACTIVE', 0,
        'Cell structure and genetics.', 'Mon • 9:00 AM - 10:30 AM');
```
