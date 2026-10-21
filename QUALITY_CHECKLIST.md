# QuizNova - the quality checklist

The shortlist of what a learning system has to get right, taken from the
usability research on Canvas, Moodle and Blackboard (the studies linked at the
bottom) and from the course players everyone uses (Sublime, Panda, LearnDash).

Every point has a fix in this app - the column "Where" says where.

## 1. Nobody may lose their work

> *"One faculty member mentioned losing questions due to forgetting the
> 'update' and 'save' steps before adding new questions."* (Canvas study)
>
> *"The main problems ... identified by students: the time limits and the
> possibility of hardware failure."* (Moodle study)

| Rule | Where |
|---|---|
| The builder saves the draft **by itself** - no "save" button to forget | `public/js/builder.js` (the autosave) |
| The student keeps the answers of a running quiz when the browser reloads or crashes | `public/js/assessment.js` (the answers in the browser) |
| The timer of a running quiz keeps its remaining time | `public/js/assessment.js` |
| The builder warns before the tab is closed with unsaved questions | `public/js/builder.js` |

## 2. A click may not do the work twice

> *"New Quizzes Build Button Triggers Update"* (Canvas issue list) - a double
> click must never publish two assessments.

| Rule | Where |
|---|---|
| Every button is disabled while its request runs | `public/js/shared.js` (`QN.button`) |
| The forms of the portal cannot be sent twice | `public/js/shared.js` |

## 3. The network may break - the app has to say so

> *"23.85% of students reported some technical issues."* /
> *"students were not easy to access the LMS because of internet problems."*

| Rule | Where |
|---|---|
| A lost connection says *"you are offline - try again"* instead of a generic error | `public/js/shared.js` (`QN.api`) |
| The request can be repeated with one click | `public/js/shared.js` (`QN.retry`) |
| The session that ran out says so and sends the visitor to the login | `public/js/shared.js` (the 401 handling) |

## 4. The videos behave like the videos of the other platforms

> *"The feature saves the exact point where the viewer stopped watching,
> allowing the video to resume when they return."* (Panda Video)
>
> *"Mark Complete button - create a LessonProgress record."* (the course
> player recipe)

| Rule | Where |
|---|---|
| The video starts where the student stopped it | `public/js/courses.js` + `lesson_progress` |
| A lesson can be marked as **done** | `public/js/courses.js` |
| The course shows *"3 of 6 lessons done"* and a progress bar | `views/courses.ejs` |
| The player offers the **next lesson** | `public/js/courses.js` |
| The playback speed can be changed | `public/js/courses.js` |

## 5. The numbers are the real ones

> *"Data looks stale - the seed didn't re-run."* / a dashboard that lies is
> worse than no dashboard.

| Rule | Where |
|---|---|
| The badges, the counters and the stat cards come from the database | the pages of the student and of the admin |
| The tests clean up after themselves - they never leave rows in the database | `test/*.test.js` |

## 6. The keyboard and the screen reader

> *"The student feedback highlighted specific accessibility issues."*
> (Canvas mobile study)

| Rule | Where |
|---|---|
| Every link, button and field shows where the focus is | `public/css/adminportal.css` + `public/css/base.css` |
| The `Escape` key closes every dialog | `public/js/shared.js` |
| The dialogs carry their role and their label | `views/**/*.ejs` |
| The search filters use `textContent` - a hidden row can be found again | the scripts of the pages |

## 7. Nothing is in the way twice

| Rule | Where |
|---|---|
| Every action has exactly one button | the sidebar and the panels of the portal |
| The search of the top bar filters what the page really shows | `public/js/adminportal.js` |
| The search is hidden when the page has nothing to search | `routes/pages.js` (the sections) |

## The sources

* [Usability Study of a Learning Management System (LMS) - Canvas](https://dl.acm.org/doi/fullHtml/10.1145/3585059.3611415)
* [Usability Problems on Desktop and Mobile Interfaces of Moodle](https://dl.acm.org/doi/10.1145/3194188.3194192)
* [Usability and Privacy Aspects of Moodle](https://www.informatica.si/index.php/informatica/article/download/451/455)
* [Evaluating the usability of LMS - Canvas on PWA and native mobile](https://mail.manuelgarcia.info/media/original/usability-canvas-lms.pdf)
* [Resume Playback - Panda Video](https://www.pandavideo.com/features/resume-playback)
* [Video Resume for LearnDash](https://wordpress.org/plugins/ld-video-resume)
* [Playback Progress Tracking - lampa](https://deepwiki.com/yumata/lampa-source/2.7-playback-progress-tracking-and-timeline)
