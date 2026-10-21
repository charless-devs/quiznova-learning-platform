/* ==========================================================================
   QuizNova - homepage
   Quick "featured quiz" modal + theme preview toggle.
   ========================================================================== */

(function () {
    'use strict';

    const state = {
        correctIndex: 0,
        selectedIndex: null,
    };

    /* ------------------------------------------------------------------ */
    /* Featured quiz modal                                                */
    /* ------------------------------------------------------------------ */

    function openQuizModal(subject, question, options, correctIndex) {
        const modal = document.getElementById('quizModal');
        if (!modal) return;

        QN.setText('modalSubjectTag', subject);
        QN.setText('modalQuestionTitle', question);

        state.correctIndex = correctIndex;
        state.selectedIndex = null;

        const optionsContainer = document.getElementById('modalOptions');
        optionsContainer.innerHTML = '';

        (options || []).forEach(function (option, index) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className =
                'w-full text-left p-3.5 rounded-xl border border-borderBg bg-slate-900/60 hover:bg-slate-800/80 text-xs font-medium text-slate-200 transition-all flex items-center justify-between option-btn-' + index;
            button.addEventListener('click', function () {
                selectOption(index);
            });
            button.innerHTML =
                '<span>' + QN.escapeHtml(option) + '</span>' +
                '<div class="w-4 h-4 rounded-full border border-slate-600 flex items-center justify-center text-[10px] radio-dot"></div>';

            optionsContainer.appendChild(button);
        });

        const feedback = document.getElementById('quizFeedback');
        feedback.className = 'hidden p-3 rounded-xl text-xs font-semibold';
        feedback.textContent = '';

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function selectOption(index) {
        state.selectedIndex = index;

        const buttons = QN.$$('#modalOptions button');
        buttons.forEach(function (button, i) {
            const dot = button.querySelector('.radio-dot');
            if (!dot) return;

            if (i === index) {
                button.classList.add('border-brand-500', 'bg-brand-500/10');
                button.classList.remove('border-borderBg', 'bg-slate-900/60');
                dot.classList.add('bg-brand-500', 'border-brand-500');
            } else {
                button.classList.remove('border-brand-500', 'bg-brand-500/10');
                button.classList.add('border-borderBg', 'bg-slate-900/60');
                dot.classList.remove('bg-brand-500', 'border-brand-500');
            }
        });
    }

    function checkAnswer() {
        if (state.selectedIndex === null) {
            QN.toast('Please select an option first!', 'error');
            return;
        }

        const feedback = document.getElementById('quizFeedback');
        feedback.classList.remove('hidden');

        if (state.selectedIndex === state.correctIndex) {
            feedback.className =
                'p-3 rounded-xl text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400';
            feedback.textContent = 'Correct! Great job testing your knowledge.';
        } else {
            feedback.className =
                'p-3 rounded-xl text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400';
            feedback.textContent = 'Not quite right. Give it another try!';
        }
    }

    function closeQuizModal() {
        const modal = document.getElementById('quizModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    /* ------------------------------------------------------------------ */
    /* Section navigation (Home / Quizzes / Subjects / About)             */
    /* ------------------------------------------------------------------ */

    /**
     * The top menu highlights the section you are looking at. The pill
     * slides to the link you hover and follows the scroll position, so it
     * is never stuck on "Home".
     */
    function initSectionNav() {
        const navs = QN.$$('[data-section-nav]');
        const links = QN.$$('[data-nav-link]');
        if (!navs.length || !links.length) return;

        const sections = links
            .map(function (link) {
                const id = link.getAttribute('data-nav-link');
                return { id: id, el: document.getElementById(id) };
            })
            .filter(function (section) {
                return !!section.el;
            });

        if (!sections.length) return;

        let activeId = sections[0].id;
        let hoveredId = null;
        let lockedUntil = 0;

        /** Move the pill + the text colour to the given section. */
        function paint() {
            const target = hoveredId || activeId;

            navs.forEach(function (nav) {
                const indicator = nav.querySelector('[data-nav-indicator]');
                if (!indicator) return;

                const link = nav.querySelector('[data-nav-link="' + target + '"]');
                if (!link) {
                    indicator.style.opacity = '0';
                    return;
                }

                indicator.style.opacity = '1';
                indicator.style.left = link.offsetLeft + 'px';
                indicator.style.top = link.offsetTop + 'px';
                indicator.style.width = link.offsetWidth + 'px';
                indicator.style.height = link.offsetHeight + 'px';
            });

            links.forEach(function (link) {
                const isActive = link.getAttribute('data-nav-link') === target;
                link.classList.toggle('text-white', isActive);
                link.classList.toggle('text-slate-300', !isActive);
            });
        }

        /** Pick the section that is currently under the header. */
        function syncWithScroll() {
            if (Date.now() < lockedUntil) return;

            const marker = 140; // the sticky header plus a little breathing room
            let current = sections[0].id;

            sections.forEach(function (section) {
                if (section.el.getBoundingClientRect().top - marker <= 0) current = section.id;
            });

            // The last section wins when the page is scrolled to the bottom.
            const scrolledToBottom =
                window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
            if (scrolledToBottom) current = sections[sections.length - 1].id;

            if (current === activeId) return;

            activeId = current;
            paint();
        }

        links.forEach(function (link) {
            const id = link.getAttribute('data-nav-link');

            link.addEventListener('mouseenter', function () {
                hoveredId = id;
                paint();
            });

            link.addEventListener('mouseleave', function () {
                hoveredId = null;
                paint();
            });

            // Keyboard users get the same feedback.
            link.addEventListener('focus', function () {
                hoveredId = id;
                paint();
            });

            link.addEventListener('blur', function () {
                hoveredId = null;
                paint();
            });

            link.addEventListener('click', function (event) {
                const section = document.getElementById(id);
                if (!section) return;

                event.preventDefault();

                activeId = id;
                hoveredId = null;
                // Keep the pill on the clicked item while the page scrolls.
                lockedUntil = Date.now() + 900;
                paint();

                section.scrollIntoView({ behavior: 'smooth', block: 'start' });

                if (window.history && window.history.replaceState) {
                    window.history.replaceState(null, '', '#' + id);
                }
            });
        });

        window.addEventListener('scroll', syncWithScroll, { passive: true });
        window.addEventListener('resize', paint);

        syncWithScroll();
        paint();
    }

    /** Give the sticky header a solid look once the page is scrolled. */
    function initHeaderState() {
        const header = document.getElementById('homeHeader');
        if (!header) return;

        const update = function () {
            header.classList.toggle('qn-header-scrolled', window.scrollY > 8);
        };

        window.addEventListener('scroll', update, { passive: true });
        update();
    }

    /* ------------------------------------------------------------------ */
    /* Expose + init                                                      */
    /* ------------------------------------------------------------------ */

    window.openQuizModal = openQuizModal;
    window.selectOption = selectOption;
    window.checkAnswer = checkAnswer;
    window.closeQuizModal = closeQuizModal;

    QN.onReady(function () {
        QN.icons();
        initSectionNav();
        initHeaderState();
    });
})();
