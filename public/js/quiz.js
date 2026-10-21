/* ==========================================================================
   QuizNova - RAPIDHUNT live coding assessment
   The question bank is loaded from /api/quiz/rapidhunt-live-coding so the
   same data powers the page and the database.
   ========================================================================== */

(function () {
    'use strict';

    const QUIZ_SLUG = 'rapidhunt-live-coding';
    const TOTAL_SECONDS = 30 * 60 + 45;

    const state = {
        questions: [],
        currentIndex: 0,
        secondsRemaining: TOTAL_SECONDS,
        timer: null,
        answers: {},
        review: {},
        skipped: {},
    };

    /* ------------------------------------------------------------------ */
    /* Syntax highlighting                                                */
    /* ------------------------------------------------------------------ */

    const TYPES = new Set([
        'int', 'float', 'double', 'void', 'char', 'long', 'short',
        'unsigned', 'signed', 'struct', 'union', 'enum', 'size_t',
    ]);

    const KEYWORDS = new Set([
        'return', 'if', 'else', 'switch', 'case', 'default', 'while', 'for',
        'do', 'break', 'continue', 'goto', 'sizeof', 'define', 'include',
        'ifndef', 'ifdef', 'endif', 'NULL', 'true', 'false',
    ]);

    const FUNCTIONS = new Set([
        'main', 'printf', 'scanf', 'malloc', 'calloc', 'realloc', 'free',
        'memcpy', 'memset', 'strcpy', 'strlen', 'SQUARE', 'func',
    ]);

    const TOKEN_RE =
        /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(#[A-Za-z_]\w*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;

    /**
     * Highlights a C snippet. The code is HTML escaped first so snippets
     * containing <stdio.h> can never break the markup.
     */
    function formatSyntax(code) {
        if (!code) return '';

        let output = '';
        let lastIndex = 0;
        let match;

        TOKEN_RE.lastIndex = 0;

        while ((match = TOKEN_RE.exec(code)) !== null) {
            output += QN.escapeHtml(code.slice(lastIndex, match.index));
            lastIndex = match.index + match[0].length;

            if (match[1]) {
                output += '<span class="syn-comment">' + QN.escapeHtml(match[1]) + '</span>';
            } else if (match[2] || match[3]) {
                output += '<span class="syn-str">' + QN.escapeHtml(match[2] || match[3]) + '</span>';
            } else if (match[4]) {
                output += '<span class="syn-keyword">' + QN.escapeHtml(match[4]) + '</span>';
            } else if (match[5]) {
                output += '<span class="syn-num">' + QN.escapeHtml(match[5]) + '</span>';
            } else {
                const word = match[6];
                if (TYPES.has(word)) {
                    output += '<span class="syn-type">' + word + '</span>';
                } else if (FUNCTIONS.has(word)) {
                    output += '<span class="syn-func">' + word + '</span>';
                } else if (KEYWORDS.has(word)) {
                    output += '<span class="syn-keyword">' + word + '</span>';
                } else {
                    output += QN.escapeHtml(word);
                }
            }
        }

        output += QN.escapeHtml(code.slice(lastIndex));
        return output;
    }

    /* ------------------------------------------------------------------ */
    /* Rendering                                                          */
    /* ------------------------------------------------------------------ */

    function renderQuestionGrid() {
        const grid = document.getElementById('questionGrid');
        if (!grid) return;

        grid.innerHTML = '';

        state.questions.forEach(function (item, index) {
            const button = document.createElement('button');
            button.type = 'button';
            button.addEventListener('click', function () {
                jumpToQuestion(index);
            });

            let classes = 'w-9 h-9 rounded-full text-xs font-bold transition-all flex items-center justify-center border-2 ';

            if (index === state.currentIndex) {
                classes += 'bg-white text-slate-900 border-white glow-cyan scale-110 z-10';
            } else if (state.review[index]) {
                classes += 'bg-transparent text-orangeAccent border-orangeAccent hover:bg-orangeAccent/10';
            } else if (state.answers[index]) {
                classes += 'bg-transparent text-tealAccent border-tealAccent hover:bg-tealAccent/10';
            } else if (state.skipped[index]) {
                classes += 'bg-transparent text-redAccent border-redAccent hover:bg-redAccent/10';
            } else {
                classes += 'bg-transparent text-slate-400 border-mutedBorder hover:border-slate-400';
            }

            button.className = classes;
            button.textContent = String(index + 1).padStart(2, '0');
            grid.appendChild(button);
        });
    }

    function loadQuestion(index) {
        const question = state.questions[index];
        if (!question) return;

        state.currentIndex = index;

        QN.setText('qTitle', question.prompt);

        const code = document.getElementById('codeSnippet');
        if (code) code.innerHTML = formatSyntax(question.code);

        const optionsBox = document.getElementById('optionsContainer');
        if (optionsBox) {
            optionsBox.innerHTML = '';

            (question.options || []).forEach(function (text, optionIndex) {
                const key = String.fromCharCode(65 + optionIndex);
                const isSelected = state.answers[index] === key;

                const card = document.createElement('div');
                card.className = 'p-3.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all duration-200 ';

                if (isSelected) {
                    card.className += 'bg-tealAccent/10 border-tealAccent text-white glow-cyan';
                } else {
                    card.className += 'bg-navCardBg/80 border-mutedBorder hover:border-slate-500 text-slate-300';
                }

                card.innerHTML =
                    '<div class="w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 ' +
                    (isSelected ? 'bg-tealAccent text-slate-900' : 'bg-cardBg border border-mutedBorder text-slate-400') +
                    '">' + key + '</div><span class="text-xs font-semibold leading-tight">' +
                    QN.escapeHtml(text) + '</span>';

                card.addEventListener('click', function () {
                    selectOption(key);
                });

                optionsBox.appendChild(card);
            });
        }

        const reviewCheckbox = document.getElementById('reviewCheckbox');
        if (reviewCheckbox) reviewCheckbox.checked = !!state.review[index];

        const btnPrev = document.getElementById('btnPrev');
        if (btnPrev) {
            btnPrev.disabled = index === 0;
            btnPrev.style.opacity = index === 0 ? '0.5' : '1';
        }

        const btnNext = document.getElementById('btnNext');
        if (btnNext) {
            btnNext.disabled = index === state.questions.length - 1;
            btnNext.style.opacity = index === state.questions.length - 1 ? '0.5' : '1';
        }

        renderQuestionGrid();
    }

    /* ------------------------------------------------------------------ */
    /* Interaction                                                        */
    /* ------------------------------------------------------------------ */

    function selectOption(key) {
        state.answers[state.currentIndex] = key;
        state.skipped[state.currentIndex] = false;
        loadQuestion(state.currentIndex);
        updateMetrics();
    }

    function toggleReviewCurrent() {
        const checkbox = document.getElementById('reviewCheckbox');
        state.review[state.currentIndex] = !!(checkbox && checkbox.checked);
        renderQuestionGrid();
        updateMetrics();
    }

    function jumpToQuestion(index) {
        if (state.answers[state.currentIndex] === undefined && !state.review[state.currentIndex]) {
            state.skipped[state.currentIndex] = true;
        }
        loadQuestion(index);
    }

    function navigate(direction) {
        const target = state.currentIndex + direction;
        if (target >= 0 && target < state.questions.length) {
            jumpToQuestion(target);
        }
    }

    function updateMetrics() {
        let answered = 0;
        let review = 0;
        let skipped = 0;

        state.questions.forEach(function (item, index) {
            if (state.answers[index]) answered += 1;
            if (state.review[index]) review += 1;
            if (!state.answers[index] && state.skipped[index]) skipped += 1;
        });

        QN.setText('statAnswered', String(answered).padStart(2, '0'));
        QN.setText('statReview', String(review).padStart(2, '0'));
        QN.setText('statSkipped', String(skipped).padStart(2, '0'));

        const total = state.questions.length || 1;
        const bar = document.getElementById('topProgressBar');
        if (bar) bar.style.width = (answered / total) * 100 + '%';
    }

    /* ------------------------------------------------------------------ */
    /* Timer                                                              */
    /* ------------------------------------------------------------------ */

    function startTimer() {
        clearInterval(state.timer);

        state.timer = setInterval(function () {
            if (state.secondsRemaining <= 0) return;
            state.secondsRemaining -= 1;
            QN.setText('timerDisplay', QN.formatTime(state.secondsRemaining));
        }, 1000);
    }

    /* ------------------------------------------------------------------ */
    /* Finish modal                                                       */
    /* ------------------------------------------------------------------ */

    function triggerFinishQuiz() {
        let answered = 0;
        let review = 0;
        let skipped = 0;

        state.questions.forEach(function (item, index) {
            if (state.answers[index]) answered += 1;
            if (state.review[index]) review += 1;
            if (!state.answers[index]) skipped += 1;
        });

        QN.setText('finalAttempted', answered + ' / ' + state.questions.length);
        QN.setText('finalTime', QN.formatTime(state.secondsRemaining));
        QN.setText('finalReview', String(review));
        QN.setText('finalSkipped', String(skipped));

        const modal = document.getElementById('finishModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeFinishModal() {
        const modal = document.getElementById('finishModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    async function submitAttempt() {
        const answers = Object.keys(state.answers).map(function (index) {
            return { position: Number(index) + 1, option: state.answers[index] };
        });

        try {
            const result = await QN.api('/api/attempts', {
                method: 'POST',
                body: {
                    slug: QUIZ_SLUG,
                    answers: answers,
                    timeSpentSeconds: TOTAL_SECONDS - state.secondsRemaining,
                },
            });

            QN.toast('Attempt saved. Score: ' + Math.round(result.score) + '%');
        } catch (err) {
            QN.toast('Attempt not saved: ' + err.message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Boot                                                               */
    /* ------------------------------------------------------------------ */

    async function init() {
        QN.icons();
        startTimer();

        const code = document.getElementById('codeSnippet');
        if (code) code.innerHTML = '<span class="code-loading">Loading question bank...</span>';

        try {
            const data = await QN.api('/api/quiz/' + QUIZ_SLUG);
            state.questions = data.questions || [];

            if (!state.questions.length) {
                throw new Error('The question bank is empty.');
            }

            renderQuestionGrid();
            loadQuestion(0);
            updateMetrics();
        } catch (err) {
            if (code) code.innerHTML = '<span class="code-loading">Could not load questions: ' + QN.escapeHtml(err.message) + '</span>';
            QN.toast('Could not load the question bank: ' + err.message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Expose                                                             */
    /* ------------------------------------------------------------------ */

    window.formatSyntax = formatSyntax;
    window.renderQuestionGrid = renderQuestionGrid;
    window.loadQuestion = loadQuestion;
    window.selectOption = selectOption;
    window.toggleReviewCurrent = toggleReviewCurrent;
    window.jumpToQuestion = jumpToQuestion;
    window.navigate = navigate;
    window.updateMetrics = updateMetrics;
    window.triggerFinishQuiz = triggerFinishQuiz;
    window.closeFinishModal = closeFinishModal;
    window.submitAttempt = submitAttempt;

    QN.onReady(init);
})();
