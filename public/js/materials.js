/* ==========================================================================
   QuizNova - study materials
   Filters the catalogue by subject and by search term.
   ========================================================================== */

(function () {
    'use strict';

    let activeSubject = 'all';

    function matches(item, term) {
        if (activeSubject !== 'all' && item.getAttribute('data-subject') !== activeSubject) {
            return false;
        }
        if (term && (item.getAttribute('data-search') || '').indexOf(term) === -1) {
            return false;
        }
        return true;
    }

    function applyFilters() {
        const input = document.getElementById('materialSearch');
        const term = input ? input.value.trim().toLowerCase() : '';

        const cards = QN.$$('[data-material]');
        let visible = 0;

        cards.forEach(function (card) {
            const show = matches(card, term);
            card.classList.toggle('is-hidden', !show);
            if (show) visible += 1;
        });

        const empty = document.getElementById('materialEmpty');
        const grid = document.getElementById('materialGrid');
        if (empty) empty.classList.toggle('hidden', visible !== 0);
        if (grid) grid.classList.toggle('hidden', visible === 0);
    }

    function initFilters() {
        const input = document.getElementById('materialSearch');
        if (input) {
            input.addEventListener('input', QN.debounce(applyFilters, 150));
        }

        const chips = QN.$$('#materialFilters [data-subject]');
        chips.forEach(function (chip) {
            chip.addEventListener('click', function () {
                activeSubject = chip.getAttribute('data-subject');

                chips.forEach(function (other) {
                    other.classList.toggle('is-active', other === chip);
                });

                applyFilters();
            });
        });
    }

    /** Opens a material (the files are a demo catalogue). */
    window.openMaterial = function (title) {
        QN.toast('Opening "' + title + '" - the demo catalogue has no real files yet.');
    };

    QN.onReady(function () {
        QN.icons();
        initFilters();
    });
})();
