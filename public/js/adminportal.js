/* ==========================================================================
   QuizNova - admin portal
   Panel switcher, the filters of the tables and the platform settings.
   The exam builder lives in its own script (public/js/builder.js).
   ========================================================================== */

(function () {
    'use strict';

    /* ------------------------------------------------------------------ */
    /* Navigation + modals                                                */
    /* ------------------------------------------------------------------ */

    function toggleMobileMenu() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        if (sidebar) sidebar.classList.toggle('-translate-x-full');
        if (overlay) overlay.classList.toggle('hidden');    }

    /** Opens the detail of one attempt. */
    async function viewStudentDetail(id) {
        try {
            const data = await QN.api('/api/admin/scores');
            const attempt = (data.scores || []).find(function (item) {
                return String(item.id) === String(id);
            });
            if (!attempt) {
                QN.toast('That attempt does not exist any more.', 'error');
                return;
            }

            QN.setText('detailStudentName', attempt.full_name);
            QN.setText('detailStudentMeta', attempt.email + ' - ' + attempt.subject);
            QN.setText('detailStudentQuiz', attempt.title);
            QN.setText('detailStudentScore', attempt.score + '%');
            QN.setText(
                'detailStudentResult',
                attempt.correct_count + ' of ' + attempt.total_questions + ' correct, ' +
                    Math.floor(attempt.time_spent_seconds / 60) + 'm ' + (attempt.time_spent_seconds % 60) + 's'
            );
            QN.setText('detailStudentDate', String(attempt.submitted_at).slice(0, 16));

            const modal = document.getElementById('studentDetailModal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    function closeStudentDetail() {
        const modal = document.getElementById('studentDetailModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    /* ------------------------------------------------------------------ */
    /* The pages of the portal                                             */
    /* ------------------------------------------------------------------ */

    /** The user list of /admin/users. */
    function initUserFilters() {
        const filters = QN.$$('.qn-role-filter');

        filters.forEach(function (filter) {
            filter.addEventListener('click', function () {
                document.body.setAttribute('data-role-filter', filter.getAttribute('data-role'));

                filters.forEach(function (other) {
                    other.classList.toggle('is-active', other === filter);
                });

                const visible = applyFilters();

                const empty = document.getElementById('userEmpty');
                if (empty) empty.classList.toggle('hidden', visible !== 0);
            });
        });
    }

    /** The score list of /admin/scores - the search lives in the top bar. */
    function initScoreFilters() {
        const rows = QN.$$('[data-score-row]');
        if (!rows.length) return;

        // The empty state follows the search of the top bar.
        const empty = document.getElementById('scoreEmpty');
        if (!empty) return;

        const observer = new MutationObserver(function () {
            const visible = rows.filter(function (row) {
                return !row.classList.contains('hidden');
            }).length;
            empty.classList.toggle('hidden', visible !== 0);
        });

        observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    /** The scorecard of /admin/scores as a CSV file. */
    async function exportScores() {
        try {
            const data = await QN.api('/api/admin/scores');
            const rows = data.scores || [];

            const lines = ['Student,Email,Quiz,Subject,Score,Correct,Total,Seconds,Submitted'];
            rows.forEach(function (item) {
                lines.push(
                    [
                        item.full_name,
                        item.email,
                        item.title,
                        item.subject,
                        item.score,
                        item.correct_count,
                        item.total_questions,
                        item.time_spent_seconds,
                        String(item.submitted_at).slice(0, 19),
                    ]
                        .map(function (value) {
                            return '"' + String(value === null || value === undefined ? '' : value).replace(/"/g, '""') + '"';
                        })
                        .join(',')
                );
            });

            const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'quiznova-scorecards.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            QN.toast(rows.length + ' scorecards exported.');
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /** The platform settings of /admin/settings. */
    function initSettings() {
        const save = document.getElementById('saveSettings');
        if (!save) return;

        const passing = document.getElementById('settingPassingScore');
        const duration = document.getElementById('settingDuration');
        const passingValue = document.getElementById('passingScoreValue');
        const durationValue = document.getElementById('durationValue');

        if (passing) {
            passing.addEventListener('input', function () {
                if (passingValue) passingValue.textContent = passing.value + '%';
            });
        }

        if (duration) {
            duration.addEventListener('input', function () {
                if (durationValue) durationValue.textContent = duration.value + 'm';
            });
        }

        QN.$$('.qn-switch').forEach(function (toggle) {
            toggle.addEventListener('click', function () {
                const on = !toggle.classList.contains('is-on');
                toggle.classList.toggle('is-on', on);
                toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        });

        save.addEventListener('click', async function () {
            const body = {};

            QN.$$('.qn-switch').forEach(function (toggle) {
                body[toggle.getAttribute('data-setting')] = toggle.classList.contains('is-on') ? 1 : 0;
            });

            if (passing) body.passing_score = Number(passing.value);
            if (duration) body.default_duration = Number(duration.value);

            try {
                await QN.api('/api/admin/settings', { method: 'POST', body: body });
                QN.toast('The platform settings are saved.');
            } catch (err) {
                QN.toast(err.message, 'error');
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* The search of the portal                                             */
    /* ------------------------------------------------------------------ */

    let searchTerm = '';

    /** Shows the rows that match the search and the role filter. */
    function applyFilters() {
        const role = document.body.getAttribute('data-role-filter') || 'all';
        let visible = 0;

        QN.$$('[data-search]').forEach(function (row) {
            const haystack = row.getAttribute('data-search') || '';
            const matchesText = !searchTerm || haystack.indexOf(searchTerm) > -1;

            const rowRole = row.getAttribute('data-role');
            const matchesRole = role === 'all' || !rowRole || rowRole === role;

            const show = matchesText && matchesRole;
            row.classList.toggle('hidden', !show);
            if (show) visible += 1;
        });

        return visible;
    }

    /**
     * The lists that the search of the portal filters besides the rows:
     * the subjects of the builder and the courses of the courses panel.
     */
    function applyListFilters() {
        let visible = 0;

        // The subjects of the exam builder.
        QN.$$('[data-subject]').forEach(function (item) {
            const haystack = (item.getAttribute('data-subject') || '').toLowerCase();
            const show = !searchTerm || haystack.indexOf(searchTerm) > -1;

            item.classList.toggle('hidden', !show);
            if (show) visible += 1;
        });

        // The courses of the courses panel.
        QN.$$('[data-course-item]').forEach(function (item) {
            const haystack = (item.getAttribute('data-course-item') || '').toLowerCase();
            const show = !searchTerm || haystack.indexOf(searchTerm) > -1;

            item.classList.toggle('hidden', !show);
            if (show) visible += 1;
        });

        return visible;
    }

    /**
     * Filters the rows of the current page by the typed text and shows a
     * live result counter.
     *
     * Every panel marks its rows with data-search, so the search works the
     * same on every page of the portal.
     */
    function adminSearch(query) {
        searchTerm = (query || '').trim().toLowerCase();

        const rows = applyFilters();
        const lists = applyListFilters();
        const visible = rows + lists;

        const counter = document.getElementById('adminSearchCount');

        if (!counter) return;

        if (!searchTerm) {
            counter.classList.add('hidden');
            counter.textContent = '';
            return;
        }

        counter.classList.remove('hidden');
        counter.textContent = visible + (visible === 1 ? ' result' : ' results');
    }

    function clearAdminSearch() {
        const input = document.getElementById('adminSearch');
        if (input) input.value = '';
        adminSearch('');
    }

    /* ------------------------------------------------------------------ */
    /* Expose + init                                                      */
    /* ------------------------------------------------------------------ */

    window.toggleMobileMenu = toggleMobileMenu;
    window.viewStudentDetail = viewStudentDetail;
    window.closeStudentDetail = closeStudentDetail;
    window.adminSearch = adminSearch;
    window.clearAdminSearch = clearAdminSearch;

    QN.onReady(function () {
        QN.icons();
        initUserFilters();
        initScoreFilters();
        initSettings();

        const exportButton = document.getElementById('exportScores');
        if (exportButton) exportButton.addEventListener('click', exportScores);
    });
})();
