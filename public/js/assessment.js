/* ==========================================================================
   QuizNova - assessments & quizzes
   Card/list views, filters, and the live assessment runner.
   ========================================================================== */

(function () {
    'use strict';

    /* ------------------------------------------------------------------ */
    /* State                                                              */
    /* ------------------------------------------------------------------ */

    const TITLE_TO_SLUG = {
        'Quiz #4: Async JS & Promises': 'async-js-promises',
        'Midterm Exam: Derivatives & Integrals': 'derivatives-integrals-midterm',
        'UI Color Theory & Gradients Test': 'ui-color-theory',
    };

    const OPTION_KEYS = ['A', 'B', 'C', 'D'];

    const runner = {
        slug: 'async-js-promises',
        quiz: null,
        questions: [],
        index: 0,
        answers: {},
        flagged: {},
        duration: 20 * 60,
        remaining: 20 * 60,
        timer: null,
    };

    /**
     * The answers of a running quiz live in the browser, so a reload, a
     * crash or a lost connection does not throw the work away.
     */
    const STORE = 'qn-quiz-progress';

    function storeKey(slug) {
        return STORE + ':' + slug;
    }

    /** Writes the state of the running quiz into the browser. */
    function saveProgress() {
        if (!runner.slug) return;

        try {
            window.localStorage.setItem(
                storeKey(runner.slug),
                JSON.stringify({
                    answers: runner.answers,
                    flagged: runner.flagged,
                    index: runner.index,
                    remaining: runner.remaining,
                    at: Date.now(),
                })
            );
        } catch (err) {
            /* the private mode does not allow it */
        }
    }

    /** Reads the state of a quiz that was started before. */
    function loadProgress(slug) {
        try {
            const raw = window.localStorage.getItem(storeKey(slug));
            if (!raw) return null;

            const saved = JSON.parse(raw);
            if (!saved || typeof saved !== 'object') return null;

            return saved;
        } catch (err) {
            return null;
        }
    }

    /** Forgets the state of a quiz (after it was sent). */
    function clearProgress(slug) {
        try {
            window.localStorage.removeItem(storeKey(slug || runner.slug));
        } catch (err) {
            /* ignore */
        }
    }

    let currentTab = 'ALL';

    /* ------------------------------------------------------------------ */
    /* Navigation                                                         */
    /* ------------------------------------------------------------------ */

    function toggleMobileMenu() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        if (sidebar) sidebar.classList.toggle('-translate-x-full');
        if (overlay) overlay.classList.toggle('hidden');
    }

    /* ------------------------------------------------------------------ */
    /* View mode                                                          */
    /* ------------------------------------------------------------------ */

    function setViewMode(mode) {
        const container = document.getElementById('assessmentsContainer');
        const btnGrid = document.getElementById('btnGridView');
        const btnList = document.getElementById('btnListView');
        if (!container) return;

        if (mode === 'list') {
            container.className = 'flex flex-col gap-3';
            if (btnList) btnList.className = 'p-1.5 rounded-lg text-white bg-brand-600 shadow-sm transition-all';
            if (btnGrid) btnGrid.className = 'p-1.5 rounded-lg text-slate-400 hover:text-white transition-all';
        } else {
            container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5';
            if (btnGrid) btnGrid.className = 'p-1.5 rounded-lg text-white bg-brand-600 shadow-sm transition-all';
            if (btnList) btnList.className = 'p-1.5 rounded-lg text-slate-400 hover:text-white transition-all';
        }
    }

    /* ------------------------------------------------------------------ */
    /* Filters                                                            */
    /* ------------------------------------------------------------------ */

    function filterByTab(tab, button) {
        currentTab = tab;

        QN.$$('.tab-btn').forEach(function (btn) {
            btn.className =
                'tab-btn px-4 py-2 rounded-xl text-xs font-semibold bg-inputBg text-slate-400 hover:text-white hover:bg-hoverBg border border-borderBg whitespace-nowrap';
        });

        if (button) {
            button.className =
                'tab-btn px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white shadow-md shadow-brand-600/20 whitespace-nowrap';
        }

        applyFilters();
    }

    function applyFilters() {
        const searchInput = document.getElementById('searchInput');
        const typeFilter = document.getElementById('typeFilter');
        const statusFilter = document.getElementById('statusFilter');
        const cards = QN.$$('.assessment-card');
        if (!searchInput) return;

        const query = searchInput.value.toLowerCase().trim();
        const type = typeFilter ? typeFilter.value : 'ALL';
        const status = statusFilter ? statusFilter.value : 'ALL';

        let count = 0;

        cards.forEach(function (card) {
            const title = (card.dataset.title || '').toLowerCase();
            const cardType = card.dataset.type;
            const cardStatus = card.dataset.status;

            // Match the title OR anything visible on the card
            // (subject, class name, badge text, ...).
            // textContent is used instead of innerText because innerText is
            // empty for cards that are currently hidden - that would make the
            // filter a one-way trap that can never widen again.
            const haystack = (title + ' ' + (card.textContent || '').toLowerCase()).replace(/\s+/g, ' ');
            const matchQuery = !query || haystack.includes(query);
            const matchType = type === 'ALL' || cardType === type;
            const matchStatus = status === 'ALL' || cardStatus === status;
            const matchTab = currentTab === 'ALL' || cardStatus === currentTab;

            if (matchQuery && matchType && matchStatus && matchTab) {
                card.style.display = 'flex';
                count += 1;
            } else {
                card.style.display = 'none';
            }
        });

        QN.setText('counterText', 'Showing ' + count + ' assessment' + (count === 1 ? '' : 's'));
        updateTabCounts();
    }

    /** Keeps the category tab labels in sync with the real card counts. */
    function updateTabCounts() {
        const cards = QN.$$('.assessment-card');

        const counts = { ALL: cards.length, UPCOMING: 0, IN_PROGRESS: 0, COMPLETED: 0 };
        cards.forEach(function (card) {
            const status = card.dataset.status;
            if (counts[status] !== undefined) counts[status] += 1;
        });

        QN.$$('.tab-btn').forEach(function (button) {
            const onclick = button.getAttribute('onclick') || '';
            const key = Object.keys(counts).find(function (status) {
                return onclick.indexOf("'" + status + "'") !== -1;
            });
            if (!key) return;

            // The "All" tab keeps its text directly on the button, the
            // others wrap the label in a <span> next to a status dot.
            const label = button.querySelector('span:not([class*="rounded-full"])');
            const target = label || button;
            const current = target.textContent.replace(/\s*\(\d+\)\s*$/, '').trim();
            target.textContent = current + ' (' + counts[key] + ')';
        });
    }

    /* ------------------------------------------------------------------ */
    /* Runner - data                                                      */
    /* ------------------------------------------------------------------ */

    async function loadRunnerQuestions(slug) {
        try {
            const data = await QN.api('/api/quiz/' + encodeURIComponent(slug));
            if (data.questions && data.questions.length) {
                runner.questions = data.questions;
                runner.quiz = data.quiz || null;

                // The assessment decides how long it may take.
                if (data.quiz && Number(data.quiz.durationMinutes) > 0) {
                    runner.duration = Number(data.quiz.durationMinutes) * 60;
                    runner.remaining = runner.duration;
                }

                // The work of a quiz that was started before is picked up.
                const saved = loadProgress(slug);
                if (saved) {
                    runner.answers = saved.answers || {};
                    runner.flagged = saved.flagged || {};
                    runner.index = Math.min(Number(saved.index) || 0, runner.questions.length - 1);

                    if (Number.isFinite(Number(saved.remaining)) && saved.remaining > 0) {
                        runner.remaining = Number(saved.remaining);
                    }

                    const answered = Object.keys(runner.answers).length;
                    if (answered) {
                        QN.toast('Your answers of the last time are still here - the quiz continues where you stopped.');
                    }
                }

                renderRunner();
            }
        } catch (err) {
            if (err.offline) {
                QN.retry(err.message, function () {
                    loadRunnerQuestions(slug);
                });
            } else {
                QN.toast('Could not load the questions: ' + err.message, 'error');
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Runner - rendering                                                 */
    /* ------------------------------------------------------------------ */

    function renderRunner() {
        const total = runner.questions.length;
        const question = runner.questions[runner.index];
        if (!question) return;

        QN.setText('qNumberBadge', 'Question ' + (runner.index + 1) + ' of ' + total);
        QN.setText('qPrompt', question.prompt);

        // The head of the runner shows what the assessment really is.
        const meta = document.getElementById('runnerMeta');
        if (meta && runner.quiz) {
            meta.textContent =
                'Total Questions: ' + total + ' • ' + (runner.quiz.subject || '') + ' • ' + (runner.quiz.title || '');
        }

        renderOptions(question);
        renderPalette();
        renderFlagState();
        renderNavButtons();
    }

    function renderOptions(question) {
        const container = document.getElementById('optionsContainer');
        if (!container) return;

        container.innerHTML = '';

        (question.options || []).forEach(function (text, index) {
            const key = OPTION_KEYS[index] || String.fromCharCode(65 + index);
            const selected = runner.answers[runner.index] === key;

            const label = document.createElement('label');
            label.className =
                'option-card flex items-center p-4 bg-inputBg border border-borderBg hover:border-brand-500 rounded-2xl cursor-pointer transition-all';
            if (selected) label.classList.add('border-brand-500', 'bg-brand-500/10');

            label.innerHTML =
                '<input type="radio" name="quizOption" value="' + key + '" class="hidden"' +
                (selected ? ' checked' : '') +
                '><span class="w-7 h-7 rounded-lg bg-cardBg border border-borderBg text-slate-300 flex items-center justify-center font-bold text-xs mr-3 check-indicator">' +
                key +
                '</span><span class="text-xs sm:text-sm font-medium text-slate-200">' +
                QN.escapeHtml(text) +
                '</span>';

            const input = label.querySelector('input');
            input.addEventListener('change', function () {
                selectOption(input);
            });

            container.appendChild(label);
        });
    }

    function renderPalette() {
        const palette = document.getElementById('questionPalette');
        if (!palette) return;

        palette.innerHTML = '';

        runner.questions.forEach(function (question, index) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'q-nav-btn w-10 h-10 rounded-xl font-bold text-xs border';
            button.textContent = String(index + 1);

            if (index === runner.index) {
                button.classList.add('is-current');
            } else if (runner.flagged[index]) {
                button.classList.add('is-flagged');
            } else if (runner.answers[index]) {
                button.classList.add('is-answered');
            } else {
                button.classList.add('bg-inputBg', 'text-slate-300', 'border-borderBg', 'hover:border-brand-500');
            }

            button.addEventListener('click', function () {
                jumpToQuestion(index + 1);
            });

            palette.appendChild(button);
        });
    }

    function renderFlagState() {
        const flagText = document.getElementById('flagText');
        const flagBtn = document.getElementById('flagBtn');
        const flagged = !!runner.flagged[runner.index];

        if (flagText) flagText.textContent = flagged ? 'Flagged for Review' : 'Flag for Review';
        if (flagBtn) {
            flagBtn.classList.toggle('text-amber-400', flagged);
            flagBtn.classList.toggle('text-slate-400', !flagged);
        }
    }

    function renderNavButtons() {
        const prev = document.getElementById('btnPrev');
        const next = document.getElementById('btnNext');
        const total = runner.questions.length;

        if (prev) {
            prev.disabled = runner.index === 0;
            prev.style.opacity = runner.index === 0 ? '0.5' : '1';
        }
        if (next) {
            next.disabled = runner.index >= total - 1;
            next.style.opacity = runner.index >= total - 1 ? '0.5' : '1';
        }
    }

    /* ------------------------------------------------------------------ */
    /* Runner - navigation                                                */
    /* ------------------------------------------------------------------ */

    async function startLiveAssessment(title, slug) {
        const modal = document.getElementById('liveRunnerModal');
        if (!modal) return;

        QN.setText('runnerTitle', title);

        // The assessments of the database come with their own slug.
        runner.slug = slug || TITLE_TO_SLUG[title] || 'async-js-promises';
        runner.index = 0;
        runner.answers = {};
        runner.flagged = {};
        runner.remaining = runner.duration;

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // The questions decide how long the assessment takes - the timer
        // starts when they are there.
        await loadRunnerQuestions(runner.slug);

        startTimer();
        renderRunner();
    }

    function closeRunner() {
        const modal = document.getElementById('liveRunnerModal');
        clearInterval(runner.timer);
        runner.timer = null;
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    function promptExitRunner() {
        if (window.confirm('Are you sure you want to pause/exit? Your progress will be saved.')) {
            closeRunner();
            QN.toast('Assessment session saved. You can resume anytime.');
        }
    }

    function selectOption(input) {
        if (!input) return;

        QN.$$('.option-card').forEach(function (card) {
            card.classList.remove('border-brand-500', 'bg-brand-500/10');
        });

        const card = input.closest('.option-card');
        if (card) card.classList.add('border-brand-500', 'bg-brand-500/10');

        runner.answers[runner.index] = input.value;
        saveProgress();
        renderPalette();
    }

    function toggleFlagQuestion() {
        runner.flagged[runner.index] = !runner.flagged[runner.index];
        saveProgress();
        renderFlagState();
        renderPalette();
    }

    function jumpToQuestion(position) {
        const index = position - 1;
        if (index < 0 || index >= runner.questions.length) return;
        runner.index = index;
        saveProgress();
        renderRunner();
    }

    function nextQuestion() {
        if (runner.index < runner.questions.length - 1) {
            runner.index += 1;
            saveProgress();
            renderRunner();
        }
    }

    function prevQuestion() {
        if (runner.index > 0) {
            runner.index -= 1;
            saveProgress();
            renderRunner();
        }
    }

    /* ------------------------------------------------------------------ */
    /* Runner - timer                                                     */
    /* ------------------------------------------------------------------ */

    function startTimer() {
        clearInterval(runner.timer);
        QN.setText('runnerTimer', QN.formatTime(runner.remaining));

        runner.timer = setInterval(function () {
            runner.remaining -= 1;
            QN.setText('runnerTimer', QN.formatTime(Math.max(0, runner.remaining)));

            // The remaining time is kept - a reload does not give the student
            // the whole quiz time again.
            if (runner.remaining % 5 === 0) saveProgress();

            if (runner.remaining <= 0) {
                clearInterval(runner.timer);
                runner.timer = null;
                window.alert('Time is up! Submitting your responses automatically.');
                closeRunner();
            }
        }, 1000);
    }

    /* ------------------------------------------------------------------ */
    /* Feedback + practice modals                                         */
    /* ------------------------------------------------------------------ */

    function openFeedbackModal(title, score, points) {
        QN.setText('feedbackTitle', title);
        QN.setText('feedbackScore', score);
        QN.setText('feedbackPoints', points);

        const modal = document.getElementById('feedbackModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeFeedbackModal() {
        const modal = document.getElementById('feedbackModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    function openCreatePracticeModal() {
        const modal = document.getElementById('practiceModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeCreatePracticeModal() {
        const modal = document.getElementById('practiceModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    function handleGeneratePractice(event) {
        event.preventDefault();
        closeCreatePracticeModal();
        startLiveAssessment('Quiz #4: Async JS & Promises');
    }

    /* ------------------------------------------------------------------ */
    /* Submission                                                         */
    /* ------------------------------------------------------------------ */

    async function submitAssessment() {
        const answers = Object.keys(runner.answers).map(function (index) {
            return { position: Number(index) + 1, option: runner.answers[index] };
        });

        // The student sees what is still open before the quiz is sent.
        const open = runner.questions.length - Object.keys(runner.answers).length;
        if (open > 0) {
            const sure = window.confirm(
                open + ' question(s) are still open.\n\nSend the quiz anyway? You cannot change the answers afterwards.'
            );
            if (!sure) return;
        }

        const slug = runner.slug;
        const timeSpent = runner.duration - runner.remaining;

        closeRunner();

        try {
            const result = await QN.api('/api/attempts', {
                method: 'POST',
                body: {
                    slug: slug,
                    answers: answers,
                    timeSpentSeconds: timeSpent,
                },
            });

            // The quiz is done - the saved answers go away.
            clearProgress(slug);

            QN.toast(
                'Assessment submitted successfully! Score: ' +
                    Math.round(result.score) +
                    '% (' +
                    (result.passed ? 'Passed' : 'Keep practising') +
                    ')'
            );
        } catch (err) {
            if (err.offline) {
                // The answers are still in the browser - the student can try
                // again without losing the work.
                QN.retry(err.message, function () {
                    submitAssessment();
                });
                return;
            }

            QN.toast('Assessment submitted. (' + err.message + ')', 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Expose + init                                                      */
    /* ------------------------------------------------------------------ */

    window.toggleMobileMenu = toggleMobileMenu;
    window.setViewMode = setViewMode;
    window.filterByTab = filterByTab;
    window.applyFilters = applyFilters;
    window.startLiveAssessment = startLiveAssessment;
    window.closeRunner = closeRunner;
    window.promptExitRunner = promptExitRunner;
    window.selectOption = selectOption;
    window.toggleFlagQuestion = toggleFlagQuestion;
    window.jumpToQuestion = jumpToQuestion;
    window.nextQuestion = nextQuestion;
    window.prevQuestion = prevQuestion;
    window.submitAssessment = submitAssessment;
    window.openFeedbackModal = openFeedbackModal;
    window.closeFeedbackModal = closeFeedbackModal;
    window.openCreatePracticeModal = openCreatePracticeModal;
    window.closeCreatePracticeModal = closeCreatePracticeModal;
    window.handleGeneratePractice = handleGeneratePractice;

    QN.onReady(function () {
        QN.icons();
        applyFilters();
    });
})();
