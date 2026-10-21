# QuizNova

A student quiz and assessment platform built with **Express 5**, **EJS** and **MySQL / MariaDB**.

> 📘 **Setting up the database?** See **[DATABASE_SETUP.md](DATABASE_SETUP.md)** — a full walkthrough for XAMPP and MySQL 8, plus troubleshooting and handy SQL queries.

```
quiznova_web/
├── app.js                  # Express app, middleware, error handling
├── config.js               # Environment configuration (+ .env loader)
├── conn.js                 # MySQL pool and promise helpers
├── db/
│   ├── schema.sql          # Tables: users, classes, quizzes, questions, attempts
│   ├── setup.js            # Creates + seeds the database (npm run db:setup)
│   └── migrate.js          # Brings an older database up to date (npm run db:migrate)
├── data/questionBank.js    # Demo questions (single source of truth)
├── data/subjects.js        # The subject catalogue (34 subjects)
├── data/progress.js        # Builds the mastery map of a student
├── data/materials.js       # Builds the resource catalogue of a student
├── middleware/auth.js      # Signed-cookie sessions, requireAuth / requireAdmin
├── routes/
│   ├── pages.js            # Page routes
│   ├── auth.js             # /api/auth/register|login|logout|me
│   └── api.js              # The data API + the admin API
├── utils/password.js       # scrypt password hashing
├── utils/realtime.js       # The realtime event bus (Server-Sent Events)
├── utils/settings.js       # The platform settings + the preferences
├── utils/subjectSettings.js# How many questions a subject gets
├── utils/quizBuilder.js    # The questions of an assessment (read + check)
├── utils/uploads.js        # The uploaded videos (safe names, the player links)
├── utils/dates.js          # The real dates of the interface
├── views/
│   ├── partials/head.ejs   # Shared <head> (fonts, tailwind config, css)
│   ├── partials/foot.ejs   # Shared scripts
│   ├── homepage.ejs        # Landing page
│   ├── register_login.ejs  # Login / registration portal
│   ├── dashboard.ejs       # Student dashboard
│   ├── profile.ejs         # Student progress (subject mastery map)
│   ├── courses.ejs         # The course list of the student
│   ├── settings.ejs        # Profile, preferences and password
│   ├── materials.ejs       # Study materials catalogue
│   ├── analytics.ejs       # Score analytics
│   ├── messages.ejs        # Inbox and chat
│   ├── community.ejs       # Community (coming soon placeholder)
│   ├── classes.ejs         # Class list, join by code, class details
│   ├── assessment.ejs      # Assessments list + live assessment runner
│   ├── quiz.ejs            # RAPIDHUNT live coding assessment (24 C questions)
│   └── admin/
│       ├── adminportal.ejs # The admin shell (sidebar + top bar + the panel)
│       ├── messages.ejs    # The student message inbox (a panel)
│       └── panels/         # One EJS per admin button
│           ├── dashboard.ejs
│           ├── builder.ejs # The exam builder (the questions of an assessment)
│           ├── scores.ejs
│           ├── users.ejs
│           ├── settings.ejs
│           ├── account.ejs # The account of the administrator
│           └── courses.ejs # The courses and the videos of the students
├── public/
│   ├── css/                # base.css + one stylesheet per page
│   ├── js/                 # shared.js + one script per page
│   │   ├── theme-init.js   # applies the stored theme before the first paint
│   │   ├── builder.js      # the exam builder (the questions and the answers)
│   │   ├── adminaccount.js # the account of the administrator
│   │   ├── admincourses.js # the courses and the videos
│   │   ├── adminmessages.js# the inbox of the admin (loaded by the portal)
│   │   └── config/         # one Tailwind theme per page
│   ├── uploads/
│   │   └── videos/         # The videos the admin uploaded
│   └── favicon.svg
└── test/                    # npm test (routes, core, homepage nav, theme)
```

**No CSS or JavaScript is inlined in the templates.** Every page loads
`/css/base.css` + `/css/<page>.css` and `/js/shared.js` + `/js/<page>.js`.

---

## Getting started

> **Want to put it online?** [DEPLOY.md](DEPLOY.md) has the whole guide for
> Vercel (a hosted MySQL, the environment variables and the Blob store for
> the uploaded videos) and for a normal server.

### 1. Install

```bash
npm install
```

### 2. Configure

Copy `.env.example` to `.env` and adjust it:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=quiznova
SESSION_SECRET=change-me-to-a-long-random-string
```

The app reads `.env` automatically (no `dotenv` dependency needed).
Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start the database (XAMPP)

Open the **XAMPP Control Panel** and press **Start** next to **MySQL**.
XAMPP ships MariaDB, which this project supports out of the box.

> **Port conflict:** XAMPP's MariaDB and the `MySQL80` Windows service both want
> port **3306**. Only one can run at a time. If MySQL80 is running, stop it with
> `net stop MySQL80` (run as Administrator), or change the port in
> `C:\xampp\mysql\bin\my.ini` and set the same `DB_PORT` in your `.env`.

The default XAMPP login is **root with an empty password**, which is exactly
what `.env.example` ships with — so usually no changes are needed. If you set
a password in phpMyAdmin, put it in `DB_PASSWORD`.

You can also use the standalone MySQL 8 service instead — the app supports
both MySQL 8 and MariaDB.

### 4. Create and seed the database

```bash
npm run db:setup
```

This creates the `quiznova` database, applies `db/schema.sql` and inserts the
demo content (6 classes, 6 quizzes, 49 questions, 3 users). It is safe to run
again at any time.

Afterwards the `quiznova` database is visible in **phpMyAdmin**
(<http://localhost/phpmyadmin>) where you can browse the tables.

### 5. Run the app

```bash
npm start        # node app.js
npm run dev      # nodemon, restarts on save
```

Open <http://localhost:3000>.

### Demo logins

| Email | Password | Role |
|---|---|---|
| `admin@quiznova.edu` | `G4MPMDfNXWn8dY9SYhxdGesR` | admin |
| `alex.morgan@example.com` | `quiznova123` | student |
| `maria.santos@example.com` | `quiznova123` | instructor |

You can also create your own account from `/accsetup`, and change any password
with `npm run db:password -- <email-or-username> --generate`.

> **Before you put the app online:** these demo accounts are public - everybody
> who reads this file knows their password. Change the password of the
> administrator (or delete the demo accounts) and set a **new**
> `SESSION_SECRET` in your `.env` before the app is reachable from the
> internet.

---

## Routes

### Pages

| Route | Template | Access |
|---|---|---|
| `/` | `homepage` | everyone |
| `/accsetup` | `register_login` | everyone (redirects to the portal of your role if signed in) |
| `/dashboard` | `dashboard` | everyone (the chart needs a session) |
| `/profile` | `profile` | signed-in users (the subject mastery map) |
| `/settings` | `settings` | signed-in users (profile, preferences, password) |
| `/courses` | `courses` | everyone (the course list) |
| `/materials` | `materials` | everyone (the resource catalogue) |
| `/analytics` | `analytics` | signed-in users (score analytics) |
| `/messages` | `messages` | signed-in users (inbox and chat) |
| `/community` | `community` | everyone (coming soon placeholder) |
| `/admin` | `admin/adminportal` | **admin accounts only** (the overview) |
| `/admin/builder` | `admin/panels/builder` | **admin accounts only** (the exam builder) |
| `/admin/scores` | `admin/panels/scores` | **admin accounts only** (the student scores) |
| `/admin/users` | `admin/panels/users` | **admin accounts only** (the user management) |
| `/admin/settings` | `admin/panels/settings` | **admin accounts only** (the platform settings) |
| `/admin/messages` | `admin/messages` | **admin accounts only** (the student inbox) |
| `/admin/account` | `admin/panels/account` | **admin accounts only** (the account of the administrator) |
| `/admin/courses` | `admin/panels/courses` | **admin accounts only** (the courses and their videos) |
| `/classes` | `classes` | everyone |
| `/assessment` | `assessment` | everyone |
| `/quiz` | `quiz` (RAPIDHUNT, 24 C questions) | everyone |
| `/admin` | `admin/adminportal` | **admin accounts only** |

### Where you land after signing in

The login form sends you to the page that belongs to your role:

| Role | Landing page |
|---|---|
| `admin` | `/admin` - the admin portal |
| `student` / `instructor` | `/dashboard` - the student app |

A `?next=` target is still honoured when your role may open it - for example
`/accsetup?next=%2Fadmin` sends an administrator back to the portal, while a
student is sent to the dashboard instead of the 403 page.

### The two areas stay apart

The admin portal and the student app have their own home, and neither one
drags the other along:

| Who | What happens |
|---|---|
| **An admin** signs in | lands on `/admin` - the admin portal. The portal has **no link into the student app**, so the admin stays in the portal. |
| **An admin** opens a student page (`/dashboard`, `/classes`, `/courses`, `/assessment`, `/materials`, `/quiz`, `/community`, `/profile`, `/analytics`, `/messages`) | The page opens and **stays open** - a refresh keeps the student portal and never jumps back into the admin one. The way back is the **Admin Portal** link in the sidebar (and the back arrow of the top bar). |
| **A student** opens the portal (`/admin`, `/admin/builder`, …) | A **403** page explains that the account has no administrator access and offers the dashboard. |
| **A student** signs in | lands on `/dashboard` - the student app, and a refresh keeps it there. |
| **A visitor without a session** | The public pages (the homepage, the login page and the demo pages) stay open. |

The back arrows of the student pages follow the role: an administrator goes
back to `/admin`, everybody else to `/dashboard`.

### The sessions of two browsers

Every browser keeps its own session - signing in on one device never changes
what another device sees:

| Rule | What it does |
|---|---|
| **One cookie per browser** | The session lives in an `HttpOnly`, host only, `SameSite=Lax` cookie. |
| **A new token per sign in** | Every sign in mints a random session id, so two browsers never carry the same cookie. |
| **"Remember me"** | Ticked: the cookie lives for a week. Unticked: it is a *browser session* cookie and disappears when the browser is closed. |
| **The role comes from the database** | The cookie only proves *who* signed in. The role is read from the account on every request, so a demoted account loses the admin portal at once and a stale cookie can never open it. |
| **The pages are never cached** | Every page is sent with `Cache-Control: no-store` and `Vary: Cookie`, so neither a browser nor a proxy can hand the admin view of one browser to another one. |
| **A closed session says goodbye** | When the session is gone, the page shows the "you are logged out" popup and sends the visitor back to the login page. |

### The admin portal

The portal is only reachable with an account whose role is `admin`:

* Signed out → redirected to `/accsetup?next=%2Fadmin`, and you land straight
  back on the portal after signing in.
* Signed in as a student/instructor → a **403** page explaining that the
  account has no administrator access.
* Signed in as an admin → the portal opens. The portal never leads into the
  student app, and the student app never jumps back into the portal by
  itself - a refresh keeps the page you are on.

The role is read from the database on every request, not from the cookie: a
session of an account that was demoted loses the portal right away, and the
student dashboard of another browser never opens the admin view.

**Making an account an administrator:**

```bash
npm run db:promote -- your.email@example.com          # -> admin
npm run db:promote -- your.email@example.com instructor
```

The new role is picked up within a couple of seconds - no need to sign out
and back in.

### API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account, starts a session |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | The signed-in user |
| `GET` | `/api/classes` | Class list (with enrolment flags) |
| `POST` | `/api/classes/join` | Join a class with its code |
| `GET` | `/api/assessments` | Assessment list |
| `GET` | `/api/quiz/:slug` | A quiz with its questions |
| `POST` | `/api/attempts` | Submit and score an attempt |
| `GET` | `/api/stats` | Dashboard statistics |
| `GET` | `/api/profile` | The mastery map of the signed-in student |
| `PATCH` | `/api/profile` | Change the name and the subject of the account |
| `GET` | `/api/profile/preferences` | The preferences of the account |
| `PUT` | `/api/profile/preferences` | Save the preferences of the account |
| `POST` | `/api/auth/password` | Change the password of the account |
| `GET` | `/api/messages` | The messages of the signed-in student |
| `POST` | `/api/messages` | Write to QuizNova Support - it reaches the admin |
| `GET` | `/api/admin/messages` | Every student message (**admin only**) |
| `GET` | `/api/admin/messages/:id/reply` | Answer a student message (**admin only**) |
| `GET` | `/api/events` | The realtime event stream (Server-Sent Events) |
| `POST` | `/api/classes` | Create a class (you become its instructor) |
| `GET` | `/api/admin/overview` | The numbers of the admin overview (**admin only**) |
| `GET` | `/api/admin/users` | Every account (**admin only**) |
| `GET` | `/api/admin/scores` | Every attempt (**admin only**) |
| `GET` | `/api/admin/quizzes` | Every assessment (**admin only**) |
| `GET` | `/api/admin/quizzes/:id` | One assessment with its questions (**admin only**) |
| `POST` | `/api/admin/quizzes` | Create an assessment with its questions (**admin only**) |
| `PUT` | `/api/admin/quizzes/:id` | Change an assessment and its questions (**admin only**) |
| `DELETE` | `/api/admin/quizzes/:id` | Remove an assessment (**admin only**) |
| `GET` | `/api/admin/subjects` | Every subject with its settings (**admin only**) |
| `PUT` | `/api/admin/subjects` | Save the settings of a subject (**admin only**) |
| `GET` | `/api/courses` | The published courses with their videos |
| `GET` | `/api/admin/courses` | Every course with its videos (**admin only**) |
| `POST` | `/api/admin/courses` | Create a course (**admin only**) |
| `PUT` | `/api/admin/courses/:id` | Change a course (**admin only**) |
| `DELETE` | `/api/admin/courses/:id` | Remove a course with its videos (**admin only**) |
| `POST` | `/api/admin/courses/:id/videos` | Add a video with a link (**admin only**) |
| `POST` | `/api/admin/courses/:id/videos/upload` | Upload a video file (**admin only**) |
| `PUT` | `/api/admin/videos/:id` | Change a video (**admin only**) |
| `DELETE` | `/api/admin/videos/:id` | Remove a video and its file (**admin only**) |
| `GET` | `/api/admin/settings` | The platform settings (**admin only**) |
| `POST` | `/api/admin/settings` | Save the platform settings (**admin only**) |

`/api/classes/join`, `/api/attempts`, `/api/stats`, `/api/profile` and
`/api/messages` require a session. The `/api/admin/*` routes need an
administrator.

### The student messages

Writing to **QuizNova Support** in the inbox (`/messages`) stores the message
in the `messages` table and puts it in the admin inbox at `/admin/messages`.
The admin can answer it (the answer shows up in the student's thread) or
close it. Every message keeps its status: `open`, `answered` or `closed`.

### Realtime

The app talks to the server over **Server-Sent Events** - no extra
dependency, the same session cookie and the browser reconnects on its own:

```
GET /api/events?events=message:new,message:reply,presence,stats:updated
```

| Event | Who gets it | What happens |
|---|---|---|
| `message:new` | admins | A new message pops into the admin inbox, with a toast. |
| `message:reply` | the student | The answer of the admin appears in the thread. |
| `presence` | everyone | How many admins are online right now. |
| `stats:updated` | the student | A quiz was submitted - the mastery map updates itself. |

The pages that listen show a **Live** dot (green when the stream is open) in
their top bar.

### The progress page

`/profile` shows how far the signed-in student has come:

* a **radar chart** of the subject mastery (one axis per subject, the shape
  grows with every quiz),
* the **top strengths** and the **topics that need attention**,
* the totals (**quizzes**, **time**, **accuracy**) and the **7 day trend**,
* the **recent attempts**.

The numbers come from the `attempts` table, so they follow the quizzes the
student really finished. Click the name in the sidebar of the dashboard, the
classes page or the assessments page to open it.

### The courses and the videos

`/admin/courses` is where the lessons of the platform are made:

* **A course** has a title, a subject, an instructor, a description and a
  status (`Draft`, `Published`, `Completed`). Only the published courses are
  in the portal of the students.
* **A video comes in two ways.**
  * **A link** - a YouTube, a Vimeo or a direct mp4. The kind of the link is
    found automatically and the player gets the right address (a YouTube
    watch link becomes the address of the player).
  * **An upload** - the video file itself (mp4, webm, ogg, ogv, mov, up to
    200 MB). The file goes into `public/uploads/videos` and the browser can
    play it right away. The upload shows how far it is.
* **The lessons can be renamed, moved and removed.** Removing a video also
  removes the file it uploaded, removing a course removes its videos.

The students watch the courses on `/courses`: the card opens the player with
the video and the list of the lessons on the side. A draft course stays
invisible for them.

The player works like the players of the other learning platforms:

* the video **starts where the student stopped it**,
* a lesson can be **marked as done** and the course shows *"2 of 6 lessons
  done"* with a progress bar,
* the **next lesson** is one click away and the speed can be changed,
* where the student stopped is kept in the database (`lesson_progress`), so
  the video continues on every device.

### The account of the administrator

`/admin/account` is a page of its own - it has nothing in common with the
profile of a student (that one is a learning map: the radar chart of the
subjects, the trend and the badges). The account of an administrator is an
operations cockpit:

| Part | What it holds |
|---|---|
| **The hero** | The shield, the name, the role, the email, the username and the day the account joined the portal - plus the quick actions (build an assessment, manage the users, the inbox, the platform settings). |
| **The snapshot** | Four tiles with the real numbers: the students, the assessments, the attempts and the open messages. |
| **The activity** | The last attempts of the students (with the score and the pass) and the latest messages - the two feeds that tell the admin what happened while they were away. |
| **Your account** | The display name and the subject of the account (saved through `PATCH /api/profile`). The email, the username and the role are shown, but they belong to the platform. |
| **The password** | The current password, the new one and a clear message when the old one is wrong. |
| **Your preferences** | The light mode of the whole site, the email notifications and the live badge - saved through `PUT /api/profile/preferences`. |

The page has its own styles (`.qn-account-hero`, `.qn-account-tile`,
`.qn-activity`, `.qn-account-input` in `public/css/adminportal.css`) and its
own script (`public/js/adminaccount.js`).

### The exam builder

`/admin/builder` is where an assessment is really built:

* **The subject decides how many questions there are.** The builder creates
  exactly as many question slots as the subject is set to - the admin sets
  the number of questions, the number of answers per question (2 - 5), the
  minutes and the points of a question in the box *The questions of …* and
  every assessment of that subject follows those numbers.
* **One assessment is one page.** The editor shows **one question at a
  time** - the question, its answers, the radio button of the correct answer
  and the points. *Previous* and *Next question* walk through the questions
  and the matrix on the right jumps straight to one of them (green = ready).
* **The button at the bottom takes the admin to the next assessment.** The
  drafts of the subject come first in the queue, the published ones after
  them. *Next assessment* saves the work as a draft and opens the next one -
  when the queue is empty, a new assessment of the subject is ready.
* **Every question is typed by hand** - the question itself, the answers and
  the radio button of the correct answer.
* **A draft may be incomplete**, a published assessment may not: every
  question needs a question, at least two answers and the mark of the
  correct one.
* **The assessments of the subject** are listed on the right - they can be
  opened again (Edit) or removed (Delete).

> The number of questions is checked by the server: an assessment of a
> subject that is set to 10 questions needs 10 questions - the browser
> cannot talk its way around it.

### The database of the builder

| Table | What it holds |
|---|---|
| `quizzes` | The assessment: title, subject, type, status (`DRAFT`, `UPCOMING`, `IN_PROGRESS`, `COMPLETED`), minutes, points, the creator and the publishing date. |
| `questions` | The questions of an assessment: the question, up to five answers, the correct answer, the type and the points. |
| `subject_settings` | The setting of every subject: how many questions it gets, how many answers a question has, how long it may take and the points of a question. |

**Bringing an older database up to date:**

```bash
npm run db:migrate
```

The migration adds the columns of the builder, the `DRAFT` status and the
table `subject_settings` - it is safe to run again and again. `npm run
db:setup` does the same and seeds the demo content.

### The other student pages

| Page | What it holds |
|---|---|
| `/courses` | The course list of the student - search, the preview modal and the whole card opens it. |
| `/settings` | Your profile (name and subject), your preferences (theme, notifications, quiz sound, daily goal) and your password. Everything is stored in the database. |
| `/materials` | The resource catalogue of your classes (notes, slides, practice sets, past papers) with a search and a subject filter. |
| `/analytics` | The score of every quiz as a bar chart, the subject comparison and the recent form. |
| `/messages` | The inbox with the conversations and a working chat composer. |
| `/community` | A placeholder - the community opens once it is ready. |

### The subjects

`data/subjects.js` is the single source of truth for the subject categories.
It holds **34 subjects** in four groups, and every picker of the app uses it -
the registration, the settings, the class creation, the practice quiz and the
exam builder:

| Group | Subjects |
|---|---|
| **Main subjects** | Mathematics, Computer Science, C Programming, English, Filipino, Science, Physics, History, Graphic Design, General Knowledge |
| **Basics** | Basic Mathematics, Basic Science, Basic English, Basic Computer Literacy, Basic Reading & Writing |
| **IT for students** | IT for Students, Programming Fundamentals, Web Development, Data Structures & Algorithms, Database Management, Networking & Internet, Cybersecurity Basics, Artificial Intelligence Basics, Digital Literacy |
| **More subjects** | Calculus, Linear Algebra, Statistics & Probability, Chemistry, Biology, Economics, Accountancy, Geography, Civic Education, Ecology |

Every subject carries an icon and a colour, so it looks the same in the
radar chart, the analytics and the badges.

### The admin portal

Every button of the admin portal has its own page and its own EJS file
(`views/admin/panels/`). All of them share **one shell** - the sidebar, the
top bar with the search of the current page and the theme toggle:

| Page | What it holds |
|---|---|
| `/admin` | The overview with the real numbers of the platform. |
| `/admin/builder` | The exam builder - publishing really creates an assessment. |
| `/admin/scores` | Every attempt of every student, with a CSV export. |
| `/admin/users` | Every account with a role filter. |
| `/admin/settings` | The platform settings - they are stored and used by the app. |
| `/admin/messages` | The inbox of the student messages. |

The search in the top bar filters the rows of the page you are on, the
sidebar marks the section that is open, and the bell shows how many messages
are waiting.

The settings are not decoration: the **passing score** decides if a finished
quiz passed, the **registration switch** closes the sign up form and the
**maintenance mode** closes it completely.

---

## Notes

* **Runs without MySQL.** If the database is unreachable the pages still render
  and the bundled demo content is served, so the UI can be worked on. The
  console prints a warning explaining how to enable the full features.
* **Works with both MySQL 8 and MariaDB** (XAMPP). `mysql2` is used instead of
  the original `mysql` package because the latter cannot authenticate against
  MySQL 8's default `caching_sha2_password`.
* **Passwords** are hashed with Node's built-in `scrypt` (no native modules).
* **No broken characters.** A text that was saved with the wrong encoding
  shows up as three characters instead of a bullet or as four strange
  letters instead of an emoji. The test suite watches every file, every
  page and the database for it, and `npm run fix:encoding` repairs it if
  something slips in.
* **The pages show the real numbers.** The badges, the counters, the stat
  cards and the **progress chart of the dashboard** come from the database -
  the chart draws the real score and the real share of correct answers of
  the last seven days (the dots mark the days with a quiz), it never shows
  a curve that was drawn by hand.
* **Nobody loses their work.** The builder saves the draft by itself, the
  running quiz keeps the answers in the browser and the video continues
  where it was left. The shortlist of the rules the app follows - and where
  each one lives - is in **[QUALITY_CHECKLIST.md](QUALITY_CHECKLIST.md)**.
* **A click does not do the work twice.** Every button is disabled while
  its request runs, so a double click never publishes two assessments.
* **A broken connection says so** - the student gets a message and a
  *Try again* button instead of a dead end.
* **The tests clean up after themselves** - they never leave rows in the
  database.
* **The search of the portal works everywhere.** It filters the rows of the
  table, the subjects of the builder and the courses of the courses panel.
  On the pages that have nothing to search (the account) the field is
  hidden instead of standing around.
* **Every button has one place.** The account is linked once in the sidebar,
  the builder has its own buttons and the top bar does not repeat them.
* **The keyboard shows where the focus is** - every link, button and field
  of the portal has a visible focus ring.
* **Sessions** use an `HttpOnly`, `SameSite=Lax` cookie signed with HMAC-SHA256.
  Every browser has its own session, the role is always read from the
  database and the pages are never cached - see
  [the sessions of two browsers](#the-sessions-of-two-browsers).
* **The site has a light mode.** Every page has a sun/moon button. The theme
  lives on `<html>` and repaints the whole site through CSS variables
  (`--qn-page`, `--qn-card`, `--qn-border`, …) that the Tailwind themes read,
  so the choice follows you across pages and is remembered in `localStorage`.
* The Tailwind Play CDN and Lucide are loaded from a CDN. For production,
  install Tailwind as a PostCSS plugin and self-host the assets.

## Tests

```bash
npm test
```

160 tests covering the syntax highlighter, password hashing, session signing,
the question bank, the subject catalogue, every page route, the admin access
rules, the account of the administrator, the courses, the uploaded videos and
the lesson progress, the separation of the admin portal and the student app,
the sessions of two browsers, the exam builder (the questions, the answers
and the number per subject), the quality rules of the checklist (the
autosave, the double click, the broken connection), the broken characters,
the homepage section navigation, the site-wide theme toggle, the student
progress model, the new student pages, the student settings, the student
messages, the realtime stream, the admin pages and a guard that the search
filters use `textContent` (so they can always be widened again).
