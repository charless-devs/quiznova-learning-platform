/* ==========================================================================
   QuizNova - the exam builder
   Create the questions of an assessment, type the answers and mark the one
   that is correct. The number of question slots follows the setting of the
   subject - the admin decides how many questions a subject gets.

   One assessment is one page: the editor shows a single question at a time
   and the button at the bottom takes the admin to the next assessment.
   ========================================================================== */

(function () {
    'use strict';

    const KEYS = ['A', 'B', 'C', 'D', 'E'];

    let autosaveTimer = null;
    let autosaveRunning = false;

    const state = {
        subject: '',
        config: {
            question_count: 10,
            option_count: 4,
            duration_minutes: 20,
            points_per_question: 10,
        },
        subjects: [],
        quizzes: [],
        quizId: null,
        status: 'DRAFT',
        questions: [],
        active: 0,
        dirty: false,
    };

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    function field(id) {
        return document.getElementById(id);
    }

    function el(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined && text !== null) element.textContent = text;
        return element;
    }

    /** Is the question ready to be published? */
    function isReady(question) {
        if (!question || !question.prompt) return false;

        const answers = (question.options || []).filter(Boolean);
        if (answers.length < 2) return false;
        if (!question.correct) return false;

        return !!question.options[KEYS.indexOf(question.correct)];
    }

    /** The question of a card - the inputs are the truth. */
    function readQuestion(index) {
        const card = document.querySelector('[data-question="' + index + '"]');
        if (!card) return null;

        const question = {
            prompt: '',
            options: ['', '', '', '', ''],
            correct: '',
            points: state.config.points_per_question,
        };

        const prompt = card.querySelector('[data-field="prompt"]');
        if (prompt) question.prompt = prompt.value;

        KEYS.forEach(function (key, position) {
            const input = card.querySelector('[data-option="' + key + '"]');
            question.options[position] = input ? input.value : '';
        });

        const correct = card.querySelector('[data-field="correct"]:checked');
        if (correct) question.correct = correct.value;

        const points = card.querySelector('[data-field="points"]');
        if (points) question.points = Number(points.value) || state.config.points_per_question;

        return question;
    }

    /* ------------------------------------------------------------------ */
    /* The question                                                        */
    /* ------------------------------------------------------------------ */

    /** Builds the card of one question. */
    function buildCard(question, index) {
        const card = el('div', 'bg-cardBg border border-borderBg rounded-2xl p-6 space-y-5');
        card.setAttribute('data-question', String(index));

        // The head: which question it is and whether it is ready.
        const head = el('div', 'flex items-center justify-between gap-3 border-b border-borderBg pb-3');
        const left = el('div', 'flex items-center gap-3 min-w-0');

        const number = el(
            'span',
            'w-8 h-8 rounded-full bg-brandBlue text-white text-xs font-bold flex items-center justify-center shrink-0',
            String(index + 1)
        );
        const title = el(
            'span',
            'text-sm font-extrabold text-white truncate',
            'Question ' + (index + 1) + ' of ' + state.questions.length
        );
        const badge = el('span', '', 'empty');
        badge.setAttribute('data-badge', '');

        left.appendChild(number);
        left.appendChild(title);
        left.appendChild(badge);
        head.appendChild(left);

        const points = el('span', 'text-[11px] text-slate-400 flex-shrink-0', (question.points || 10) + ' points');
        points.setAttribute('data-points-label', '');
        head.appendChild(points);
        card.appendChild(head);

        // The question itself.
        const prompt = el(
            'textarea',
            'w-full bg-inputBg border border-borderBg rounded-xl p-4 text-xs sm:text-sm text-slate-200 leading-relaxed ' +
                'focus:outline-none focus:border-brandBlue transition-colors font-sans'
        );
        prompt.rows = 4;
        prompt.placeholder = 'Type the question...';
        prompt.setAttribute('data-field', 'prompt');
        prompt.value = question.prompt || '';
        card.appendChild(prompt);

        // The answers - one row per answer of the subject.
        const answers = el('div', 'space-y-2');
        const optionCount = Math.max(2, Math.min(5, state.config.option_count));

        for (let i = 0; i < optionCount; i += 1) {
            const key = KEYS[i];

            const row = el(
                'label',
                'flex items-center gap-2.5 p-3 rounded-xl bg-inputBg border border-borderBg ' +
                    'transition-colors cursor-pointer hover:border-brandBlue'
            );
            row.setAttribute('data-option-row', key);

            const radio = el('input', 'w-4 h-4 shrink-0');
            radio.type = 'radio';
            radio.name = 'builder-correct-' + index;
            radio.value = key;
            radio.setAttribute('data-field', 'correct');
            if (question.correct === key) radio.checked = true;

            const letter = el(
                'span',
                'w-7 h-7 rounded-lg bg-navBg border border-borderBg text-slate-300 flex items-center ' +
                    'justify-center font-bold text-xs shrink-0',
                key
            );

            const input = el(
                'input',
                'flex-1 bg-transparent border-0 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none'
            );
            input.type = 'text';
            input.placeholder = 'Type the answer ' + key;
            input.setAttribute('data-option', key);
            input.value = (question.options || [])[i] || '';

            row.appendChild(radio);
            row.appendChild(letter);
            row.appendChild(input);
            answers.appendChild(row);
        }

        card.appendChild(answers);

        // The points of the question.
        const foot = el('div', 'flex items-center justify-between gap-3 pt-1 border-t border-borderBg');
        foot.appendChild(el('span', 'text-[11px] text-slate-400 font-semibold', 'Points of this question'));

        const pointsInput = el(
            'input',
            'w-20 px-2.5 py-1.5 bg-inputBg border border-borderBg rounded-lg text-xs text-white focus:outline-none focus:border-brandBlue'
        );
        pointsInput.type = 'number';
        pointsInput.min = '1';
        pointsInput.max = '100';
        pointsInput.setAttribute('data-field', 'points');
        pointsInput.value = String(question.points || state.config.points_per_question);

        foot.appendChild(pointsInput);
        card.appendChild(foot);

        return card;
    }

    /** Draws the question that is open - one question, one page. */
    function renderQuestion() {
        const container = field('builderQuestions');
        if (!container) return;

        container.innerHTML = '';

        const question = state.questions[state.active];

        if (!question) {
            container.appendChild(
                el(
                    'p',
                    'text-xs text-slate-500 leading-relaxed',
                    'This subject has no questions yet - set how many questions it gets in the box above.'
                )
            );
        } else {
            container.appendChild(buildCard(question, state.active));
        }

        if (question) updateCardBadge(state.active);

        updateProgress();
        renderMatrix();
        QN.icons();
    }

    /** Shows if a question is ready. */
    function updateCardBadge(index) {
        const card = document.querySelector('[data-question="' + index + '"]');
        if (!card) return;

        const badge = card.querySelector('[data-badge]');
        if (badge) {
            const ready = isReady(state.questions[index]);
            badge.textContent = ready ? 'ready' : 'empty';
            badge.className =
                'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ' +
                (ready ? 'bg-emeraldSuccess/20 text-emerald-300' : 'bg-inputBg text-slate-400');
        }

        const label = card.querySelector('[data-points-label]');
        if (label) label.textContent = (state.questions[index].points || 10) + ' points';
    }

    /** The circles of the questions on the right. */
    function renderMatrix() {
        const container = field('builderMatrix');
        if (!container) return;

        container.innerHTML = '';

        state.questions.forEach(function (question, index) {
            const button = el('button', '', String(index + 1));
            button.type = 'button';

            if (index === state.active) {
                button.className =
                    'w-8 h-8 rounded-full font-bold text-xs transition-all flex items-center justify-center ' +
                    'bg-brandBlue text-white shadow-md shadow-brandBlue/30 scale-105 ring-2 ring-brandBlue';
            } else if (isReady(question)) {
                button.className =
                    'w-8 h-8 rounded-full font-bold text-xs transition-all flex items-center justify-center ' +
                    'bg-emeraldSuccess text-white shadow-sm';
            } else {
                button.className =
                    'w-8 h-8 rounded-full font-bold text-xs transition-all flex items-center justify-center ' +
                    'bg-inputBg text-slate-300 hover:bg-borderBg hover:text-white border border-borderBg';
            }

            button.addEventListener('click', function () {
                jumpTo(index);
            });

            container.appendChild(button);
        });

        QN.setText('builderMatrixCounter', state.active + 1 + ' of ' + state.questions.length);
        QN.setText('builderSubjectBadge', state.subject);
    }

    /** How many questions are ready. */
    function updateProgress() {
        const ready = state.questions.filter(isReady).length;
        QN.setText('builderProgress', ready + ' of ' + state.questions.length + ' questions are ready');
    }

    /** Opens a question. */
    function jumpTo(index) {
        if (index < 0 || index >= state.questions.length) return;

        state.active = index;
        renderQuestion();

        const card = document.querySelector('[data-question="' + index + '"]');
        if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function nextQuestion() {
        jumpTo(state.active + 1);
    }

    function prevQuestion() {
        jumpTo(state.active - 1);
    }

    /* ------------------------------------------------------------------ */
    /* The subjects                                                        */
    /* ------------------------------------------------------------------ */

    /** Marks the subject of the list that is open. */
    function markSubject(name) {
        QN.$$('.subject-btn').forEach(function (btn) {
            const idle =
                'subject-btn w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl ' +
                'text-slate-400 hover:text-white hover:bg-inputBg text-xs font-medium transition-colors';
            const active =
                'subject-btn w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl ' +
                'bg-brandBlue text-white font-bold text-xs shadow-md';

            btn.className = btn.getAttribute('data-subject') === name ? active : idle;
        });
    }

    /** Picks a subject and starts a fresh assessment of it. */
    function selectSubject(button, name) {
        // A half typed assessment should not get lost.
        if (state.dirty && state.subject && state.subject !== name) {
            const sure = window.confirm(
                'The assessment of "' + state.subject + '" has unsaved changes.\n\nLeave it and start a new one?'
            );
            if (!sure) return;
        }

        state.subject = name;
        markSubject(name);

        const found = state.subjects.find(function (item) {
            return item.subject === name;
        });

        state.config = found
            ? {
                  question_count: found.question_count,
                  option_count: found.option_count,
                  duration_minutes: found.duration_minutes,
                  points_per_question: found.points_per_question,
              }
            : { question_count: 10, option_count: 4, duration_minutes: 20, points_per_question: 10 };

        QN.setText('builderSubjectName', name);
        QN.setText('builderSubjectBadge', name);

        const count = field('builderQuestionCount');
        if (count) count.value = state.config.question_count;

        const options = field('builderOptionCount');
        if (options) options.value = String(state.config.option_count);

        const subjectDuration = field('builderSubjectDuration');
        if (subjectDuration) subjectDuration.value = state.config.duration_minutes;

        const points = field('builderPoints');
        if (points) points.value = state.config.points_per_question;

        const duration = field('builderDuration');
        if (duration) duration.value = state.config.duration_minutes;

        resetEditor();
        renderQuizList();
    }

    /** An empty assessment with the slots of the subject. */
    function resetEditor() {
        state.quizId = null;
        state.status = 'DRAFT';
        state.active = 0;
        state.dirty = false;
        state.questions = [];

        for (let i = 0; i < state.config.question_count; i += 1) {
            state.questions.push({
                prompt: '',
                options: ['', '', '', '', ''],
                correct: '',
                points: state.config.points_per_question,
            });
        }

        const title = field('builderTitle');
        if (title) title.value = '';

        const type = field('builderType');
        if (type) type.value = 'QUIZ';

        updateStateBadge();
        renderQuestion();
        renderQueue();
    }

    /** The badge that shows what happens to the assessment. */
    function updateStateBadge() {
        const badge = field('builderState');
        if (!badge) return;

        const labels = {
            DRAFT: ['Draft', 'bg-amber-500/20 text-amber-300'],
            UPCOMING: ['Upcoming', 'bg-brandBlue/20 text-brand-300'],
            IN_PROGRESS: ['Published', 'bg-emeraldSuccess/20 text-emerald-300'],
            COMPLETED: ['Closed', 'bg-inputBg text-slate-400'],
        };

        const entry = labels[state.status] || labels.DRAFT;
        badge.textContent = entry[0];
        badge.className = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ' + entry[1];
    }

    /* ------------------------------------------------------------------ */
    /* The assessments of the subject                                       */
    /* ------------------------------------------------------------------ */

    /**
     * The assessments of the subject - the queue of the builder.
     *
     * The drafts come first: those are the ones that still need work. The
     * "Next assessment" button walks down this list.
     */
    function queue() {
        const order = { DRAFT: 0, UPCOMING: 1, IN_PROGRESS: 2, COMPLETED: 3 };

        return state.quizzes
            .filter(function (quiz) {
                return quiz.subject === state.subject;
            })
            .slice()
            .sort(function (a, b) {
                const first = order[a.status] === undefined ? 9 : order[a.status];
                const second = order[b.status] === undefined ? 9 : order[b.status];

                if (first !== second) return first - second;
                return Number(a.id) - Number(b.id);
            });
    }

    /** Shows where the admin is in the queue and what comes next. */
    function renderQueue() {
        const list = queue();
        const current = list.findIndex(function (quiz) {
            return Number(quiz.id) === Number(state.quizId);
        });

        const position = current > -1 ? current + 1 : 0;
        QN.setText('builderQueue', position ? 'Assessment ' + position + ' of ' + list.length : 'A new assessment');

        const next = position && position < list.length ? list[position] : list.find(function (quiz) {
            return Number(quiz.id) !== Number(state.quizId);
        });

        QN.setText('builderNextName', next ? next.title : 'a new assessment of ' + state.subject);

        const button = field('builderNextAssessment');
        if (button) {
            button.querySelector('span').textContent = next ? 'Next assessment' : 'Start a new assessment';
        }
    }

    function renderQuizList() {
        const container = field('builderQuizList');
        if (!container) return;

        container.innerHTML = '';

        const list = queue();

        QN.setText('builderQuizCount', list.length + ' total');

        if (!list.length) {
            container.appendChild(
                el('p', 'text-[11px] text-slate-500 leading-relaxed', 'No assessment of this subject yet - build the first one.')
            );
            return;
        }

        const labels = {
            DRAFT: ['Draft', 'bg-amber-500/20 text-amber-300'],
            UPCOMING: ['Upcoming', 'bg-brandBlue/20 text-brand-300'],
            IN_PROGRESS: ['Published', 'bg-emeraldSuccess/20 text-emerald-300'],
            COMPLETED: ['Closed', 'bg-inputBg text-slate-400'],
        };

        list.forEach(function (quiz) {
            const row = el('div', 'p-3 rounded-xl bg-inputBg border border-borderBg space-y-2');

            if (Number(quiz.id) === Number(state.quizId)) {
                row.className += ' border-brandBlue/60 bg-brandBlue/10';
            }

            const head = el('div', 'flex items-start justify-between gap-2');
            head.appendChild(el('p', 'text-xs font-bold text-white truncate flex-1', quiz.title));

            const entry = labels[quiz.status] || labels.DRAFT;
            const status = el('span', 'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0', entry[0]);
            status.className += ' ' + entry[1];
            head.appendChild(status);

            row.appendChild(head);

            row.appendChild(
                el(
                    'p',
                    'text-[10px] text-slate-400',
                    (quiz.question_count || quiz.total_questions || 0) +
                        ' questions - ' +
                        (quiz.duration_minutes || 0) +
                        ' minutes'
                )
            );

            const actions = el('div', 'flex items-center gap-2');

            const edit = el('button', 'flex-1 py-1.5 text-[11px] font-bold rounded-lg bg-brandBlue/20 text-brand-300 border border-brandBlue/30 hover:bg-brandBlue/30 transition-colors', 'Edit');
            edit.type = 'button';
            edit.addEventListener('click', function () {
                loadQuiz(quiz.id);
            });

            const remove = el('button', 'px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-inputBg text-slate-400 border border-borderBg hover:text-rose-300 transition-colors', 'Delete');
            remove.type = 'button';
            remove.addEventListener('click', function () {
                deleteQuiz(quiz.id, quiz.title);
            });

            actions.appendChild(edit);
            actions.appendChild(remove);
            row.appendChild(actions);

            container.appendChild(row);
        });
    }

    /* ------------------------------------------------------------------ */
    /* The database                                                        */
    /* ------------------------------------------------------------------ */

    /** Reads the subjects and the assessments. */
    async function loadAll() {
        try {
            const [subjectsData, quizzesData] = await Promise.all([
                QN.api('/api/admin/subjects'),
                QN.api('/api/admin/quizzes'),
            ]);

            state.subjects = subjectsData.subjects || [];
            state.quizzes = quizzesData.quizzes || [];

            QN.setText('builderSubjectTotal', state.subjects.length + ' subjects');

            const button = document.querySelector('.subject-btn');
            const name = button ? button.getAttribute('data-subject') : '';

            if (name) selectSubject(button, name);
        } catch (err) {
            QN.toast('The builder could not be loaded: ' + err.message, 'error');
        }
    }

    /** Reads the assessments again (after a save or a delete). */
    async function loadQuizzes() {
        try {
            const data = await QN.api('/api/admin/quizzes');
            state.quizzes = data.quizzes || [];
            renderQuizList();
            renderQueue();
        } catch (err) {
            console.warn('[builder] could not load the assessments:', err.message);
        }
    }

    /**
     * Saves the settings of the subject - how many questions it gets, how
     * many answers a question has and how long it may take.
     */
    async function saveSubjectSettings() {
        const count = field('builderQuestionCount');
        const options = field('builderOptionCount');
        const duration = field('builderSubjectDuration');
        const points = field('builderPoints');

        const body = {
            subject: state.subject,
            question_count: count ? Number(count.value) : state.config.question_count,
            option_count: options ? Number(options.value) : state.config.option_count,
            duration_minutes: duration ? Number(duration.value) : state.config.duration_minutes,
            points_per_question: points ? Number(points.value) : state.config.points_per_question,
        };

        try {
            const data = await QN.api('/api/admin/subjects', { method: 'PUT', body: body });

            state.config = {
                question_count: data.subject.question_count,
                option_count: data.subject.option_count,
                duration_minutes: data.subject.duration_minutes,
                points_per_question: data.subject.points_per_question,
            };

            // The badge of the subject in the list on the left.
            const button = document.querySelector('[data-subject="' + state.subject + '"]');
            if (button) {
                const badge = button.querySelector('[data-subject-count]');
                if (badge) badge.textContent = state.config.question_count + ' Qs';
            }

            QN.setText('builderSettingsState', 'saved');
            state.dirty = true;
            resizeQuestions();
        } catch (err) {
            QN.setText('builderSettingsState', 'not saved');
            QN.toast(err.message, 'error');
        }
    }

    /** Brings the questions in line with the number of the subject. */
    function resizeQuestions() {
        const wanted = state.config.question_count;
        const questions = state.questions || [];

        if (questions.length > wanted) {
            const removed = questions.splice(wanted);
            const withText = removed.filter(function (question) {
                return isReady(question) || question.prompt;
            });

            if (withText.length) {
                QN.toast(withText.length + ' question(s) were removed - the subject now has ' + wanted + '.', 'error');
            }
        }

        while (questions.length < wanted) {
            questions.push({
                prompt: '',
                options: ['', '', '', '', ''],
                correct: '',
                points: state.config.points_per_question,
            });
        }

        state.questions = questions;

        // The questions that are still there keep their points.
        state.questions.forEach(function (question) {
            if (!question.points) question.points = state.config.points_per_question;
        });

        if (state.active >= state.questions.length) state.active = Math.max(0, state.questions.length - 1);

        renderQuestion();
    }

    /** Loads an assessment into the editor. */
    async function loadQuiz(id) {
        try {
            const data = await QN.api('/api/admin/quizzes/' + id);
            const quiz = data.quiz;
            const questions = data.questions || [];

            state.quizId = quiz.id;
            state.status = quiz.status;
            state.subject = quiz.subject;
            state.dirty = false;

            // The list of the subjects marks the one of this assessment.
            markSubject(quiz.subject);

            const title = field('builderTitle');
            if (title) title.value = quiz.title || '';

            const type = field('builderType');
            if (type) type.value = quiz.type || 'QUIZ';

            const duration = field('builderDuration');
            if (duration) duration.value = quiz.duration_minutes || state.config.duration_minutes;

            // How many answers do the questions of this assessment have?
            let optionCount = state.config.option_count;
            questions.forEach(function (question) {
                const filled = (question.options || []).filter(Boolean).length;
                if (filled > optionCount) optionCount = Math.min(5, filled);
            });
            state.config.option_count = optionCount;

            const options = field('builderOptionCount');
            if (options) options.value = String(optionCount);

            state.questions = questions.map(function (question) {
                return {
                    prompt: question.prompt || '',
                    options: (question.options || []).slice(0, 5),
                    correct: question.correct || '',
                    points: question.points || state.config.points_per_question,
                };
            });

            while (state.questions.length < state.config.question_count) {
                state.questions.push({
                    prompt: '',
                    options: ['', '', '', '', ''],
                    correct: '',
                    points: state.config.points_per_question,
                });
            }

            state.active = 0;
            updateStateBadge();
            renderQuestion();
            renderQuizList();
            renderQueue();

            // The number of questions of the assessment and the one of the
            // subject have to be the same - the admin should know.
            if (state.questions.length !== state.config.question_count) {
                QN.toast(
                    'This assessment has ' +
                        state.questions.length +
                        ' questions - the subject "' +
                        state.subject +
                        '" is set to ' +
                        state.config.question_count +
                        '.',
                    'error'
                );
            } else {
                QN.toast('"' + quiz.title + '" is open in the editor.');
            }
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /** Removes an assessment. */
    async function deleteQuiz(id, title) {
        const sure = window.confirm(
            'Remove the assessment "' + title + '"?\n\nThe questions and the results of the students go with it.'
        );
        if (!sure) return;

        try {
            await QN.api('/api/admin/quizzes/' + id, { method: 'DELETE' });

            if (state.quizId === id) resetEditor();

            await loadQuizzes();
            QN.toast('The assessment is removed.');
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /** The assessment as it is typed right now. */
    function collect() {
        const questions = state.questions.map(function (question, index) {
            return readQuestion(index) || question;
        });

        const title = field('builderTitle');
        const type = field('builderType');
        const duration = field('builderDuration');

        return {
            title: title ? title.value.trim() : '',
            subject: state.subject,
            type: type ? type.value : 'QUIZ',
            status: state.status,
            duration: duration ? Number(duration.value) : 0,
            // The number of questions is not sent: the server takes it from
            // the setting of the subject.
            questions: questions,
        };
    }

    /**
     * Saves the assessment (as a draft or published).
     *
     * The button is disabled while the request runs - a double click must
     * never publish two assessments.
     */
    async function save(status, button, options) {
        const quiet = !!(options && options.quiet);
        const payload = collect();
        payload.status = status;

        if (!payload.title) {
            QN.toast('Give the assessment a title first.', 'error');
            const title = field('builderTitle');
            if (title) title.focus();
            return false;
        }

        const publish = status !== 'DRAFT';

        if (publish) {
            const ready = state.questions.filter(isReady).length;
            if (ready !== state.config.question_count) {
                QN.toast(
                    'Only ' +
                        ready +
                        ' of ' +
                        state.config.question_count +
                        ' questions are ready - every question needs a question, two answers and the correct one.',
                    'error'
                );
                return false;
            }
        }

        const work = async function () {
            try {
                const data = state.quizId
                    ? await QN.api('/api/admin/quizzes/' + state.quizId, { method: 'PUT', body: payload })
                    : await QN.api('/api/admin/quizzes', { method: 'POST', body: payload });

                state.quizId = data.quiz.id;
                state.status = data.quiz.status;
                state.dirty = false;

                updateStateBadge();
                await loadQuizzes();

                if (!quiet) {
                    QN.toast(
                        publish
                            ? '"' + data.quiz.title + '" is published - the students can take it now.'
                            : 'The draft is saved.'
                    );
                }

                updateSaveState('saved');

                return true;
            } catch (err) {
                const errors = (err.payload && err.payload.errors) || {};

                if (errors.questions && errors.questions.length) {
                    updateSaveState('not saved');
                    errors.questions.forEach(function (message) {
                        QN.toast(message, 'error');
                    });
                } else if (err.offline) {
                    updateSaveState('not saved');
                    QN.retry(err.message, function () {
                        save(status, button, options);
                    });
                } else {
                    updateSaveState('not saved');
                    if (!quiet) QN.toast(err.message, 'error');
                }

                return false;
            }
        };

        updateSaveState('saving');

        return QN.button(button, publish ? 'Publishing...' : 'Saving...', work);
    }

    /** The little label that shows whether the work is saved. */
    function updateSaveState(state) {
        const label = field('builderSaveState');
        if (!label) return;

        const labels = {
            saved: ['All changes are saved', 'text-emerald-300'],
            saving: ['Saving...', 'text-slate-400'],
            unsaved: ['Unsaved changes', 'text-amber-300'],
            'not saved': ['The last save failed', 'text-rose-300'],
        };

        const entry = labels[state] || labels.unsaved;
        label.textContent = entry[0];
        label.className = 'text-[10px] font-semibold ' + entry[1];
    }

    /**
     * The autosave: the draft of the builder is written by itself, so a
     * question never gets lost because the "save" button was forgotten.
     */
    function startAutosave() {
        if (autosaveTimer) clearInterval(autosaveTimer);

        autosaveTimer = setInterval(function () {
            if (!state.dirty) return;
            if (!state.quizId) return; // a new assessment is saved with its title
            if (autosaveRunning) return;

            const title = field('builderTitle');
            if (!title || !title.value.trim()) return;

            autosaveRunning = true;
            save('DRAFT', null, { quiet: true }).finally(function () {
                autosaveRunning = false;
            });
        }, 20000);
    }

    /**
     * The button at the bottom of the page: the work is saved and the next
     * assessment of the subject is opened.
     */
    async function nextAssessment() {
        if (state.dirty) {
            const saved = await save('DRAFT');
            if (!saved) return;
        }

        const list = queue();
        const current = list.findIndex(function (quiz) {
            return Number(quiz.id) === Number(state.quizId);
        });

        const next = current > -1 ? list[current + 1] : list[0];

        if (next) {
            await loadQuiz(next.id);
            QN.toast('Now building "' + next.title + '".');
            return;
        }

        resetEditor();
        QN.toast('A new assessment of ' + state.subject + ' is ready.');
    }

    /* ------------------------------------------------------------------ */
    /* The events                                                          */
    /* ------------------------------------------------------------------ */

    function initEvents() {
        const container = field('builderQuestions');
        if (container) {
            const sync = function (event) {
                const card = event.target.closest('[data-question]');
                if (!card) return;

                const index = Number(card.getAttribute('data-question'));
                const question = readQuestion(index);
                if (!question) return;

                state.questions[index] = question;
                state.dirty = true;
                updateSaveState('unsaved');

                updateCardBadge(index);
                renderMatrix();
                updateProgress();
            };

            container.addEventListener('input', sync);
            container.addEventListener('change', sync);
        }

        const subjectButton = field('addSubjectBtn');
        if (subjectButton) {
            subjectButton.addEventListener('click', function () {
                const name = window.prompt('Name of the new subject');
                if (!name || !name.trim()) return;

                addSubject(name.trim());
            });
        }

        const create = field('builderNew');
        if (create) {
            create.addEventListener('click', function () {
                if (state.dirty) {
                    const sure = window.confirm('The assessment has unsaved changes.\n\nStart a new one?');
                    if (!sure) return;
                }

                resetEditor();
                QN.toast('A new assessment of ' + state.subject + ' is ready.');
            });
        }

        const draft = field('builderSaveDraft');
        if (draft) {
            draft.addEventListener('click', function () {
                save('DRAFT', draft);
            });
        }

        const publish = field('builderPublish');
        if (publish) {
            publish.addEventListener('click', function () {
                save('IN_PROGRESS', publish);
            });
        }

        const add = field('builderAddQuestion');
        if (add) {
            add.addEventListener('click', function () {
                const count = field('builderQuestionCount');
                if (!count) return;

                count.value = String(Math.min(100, (Number(count.value) || 0) + 1));
                saveSubjectSettings();
            });
        }

        const previous = field('builderPrevQuestion');
        if (previous) {
            previous.addEventListener('click', function () {
                prevQuestion();
            });
        }

        const next = field('builderNextQuestion');
        if (next) {
            next.addEventListener('click', function () {
                nextQuestion();
            });
        }

        const nextAssessmentButton = field('builderNextAssessment');
        if (nextAssessmentButton) {
            nextAssessmentButton.addEventListener('click', function () {
                nextAssessment();
            });
        }

        // The settings of the subject - they decide how many questions it gets.
        ['builderQuestionCount', 'builderOptionCount', 'builderSubjectDuration', 'builderPoints'].forEach(function (id) {
            const input = field(id);
            if (!input) return;

            input.addEventListener('change', function () {
                saveSubjectSettings();
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /* Expose + init                                                      */
    /* ------------------------------------------------------------------ */

    window.builderSelectSubject = selectSubject;
    window.builderSaveDraft = function () {
        save('DRAFT', field('builderSaveDraft'));
    };
    window.builderPublish = function () {
        save('IN_PROGRESS', field('builderPublish'));
    };
    window.builderNextQuestion = nextQuestion;
    window.builderPrevQuestion = prevQuestion;
    window.builderNextAssessment = nextAssessment;

    QN.onReady(function () {
        if (!field('builderQuestions')) return;

        initEvents();
        loadAll();
        startAutosave();

        // The tab may be closed with questions that are not saved yet.
        window.addEventListener('beforeunload', function (event) {
            if (!state.dirty) return;

            event.preventDefault();
            event.returnValue = '';
        });
    });
})();
