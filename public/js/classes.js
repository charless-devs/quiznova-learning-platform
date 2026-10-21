/* ==========================================================================
   QuizNova - my classes
   Grid/list switcher, tab + dropdown filters, join class and detail modals.
   ========================================================================== */

(function () {
    'use strict';

    let currentViewMode = 'grid';
    let currentActiveTab = 'ALL';

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
        currentViewMode = mode;

        const container = document.getElementById('classesContainer');
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

    function filterByTab(tab, element) {
        currentActiveTab = tab;

        QN.$$('.tab-btn').forEach(function (button) {
            button.className =
                'tab-btn px-4 py-2 rounded-xl text-xs font-semibold bg-inputBg text-slate-400 hover:text-white hover:bg-hoverBg border border-borderBg whitespace-nowrap';
        });

        if (element) {
            element.className =
                'tab-btn px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white shadow-md shadow-brand-600/20 whitespace-nowrap';
        }

        applyFilters();
    }

    function applyFilters() {
        const searchInput = document.getElementById('searchInput');
        const deptFilter = document.getElementById('deptFilter');
        const statusFilter = document.getElementById('statusFilter');
        const cards = QN.$$('.class-card');
        if (!searchInput) return;

        const query = searchInput.value.toLowerCase().trim();
        const dept = deptFilter ? deptFilter.value : 'ALL';
        const status = statusFilter ? statusFilter.value : 'ALL';

        let visible = 0;

        cards.forEach(function (card) {
            const title = (card.dataset.title || '').toLowerCase();
            const code = (card.dataset.code || '').toLowerCase();
            const cardDept = card.dataset.dept;
            const cardStatus = card.dataset.status;
            const isLive = card.dataset.live === 'true';

            // Match the title, the code OR anything visible on the card
            // (instructor, department, schedule, ...).
            // textContent is used instead of innerText because innerText is
            // empty for cards that are currently hidden - that would make the
            // filter a one-way trap that can never widen again.
            const haystack = (
                title +
                ' ' +
                code +
                ' ' +
                (card.textContent || '').toLowerCase()
            ).replace(/\s+/g, ' ');
            const matchesSearch = !query || haystack.includes(query);

            const matchesDept = dept === 'ALL' || cardDept === dept;
            const matchesStatus =
                status === 'ALL' ||
                (status === 'ACTIVE' && (cardStatus === 'ACTIVE' || isLive)) ||
                (status === 'COMPLETED' && cardStatus === 'COMPLETED');

            let matchesTab = true;
            if (currentActiveTab === 'LIVE') matchesTab = isLive;
            if (currentActiveTab === 'IN_PROGRESS') matchesTab = cardStatus === 'ACTIVE';
            if (currentActiveTab === 'COMPLETED') matchesTab = cardStatus === 'COMPLETED';

            if (matchesSearch && matchesDept && matchesStatus && matchesTab) {
                card.style.display = 'flex';
                visible += 1;
            } else {
                card.style.display = 'none';
            }
        });

        QN.setText(
            'classCounterText',
            'Showing ' + visible + ' class' + (visible === 1 ? '' : 'es')
        );
    }

    /* ------------------------------------------------------------------ */
    /* Copy a class link                                                  */
    /* ------------------------------------------------------------------ */

    async function copyClassLink(source) {
        // The button either carries the class code or lives inside a card.
        let code = typeof source === 'string' ? source : '';

        if (!code && source && source.closest) {
            const card = source.closest('.class-card');
            if (card) code = card.dataset.code || '';
        }
        if (!code) code = 'CLASS-LINK';

        const link = window.location.origin + '/classes?code=' + encodeURIComponent(code);
        const ok = await QN.copyToClipboard(link);

        if (ok) {
            QN.toast('Class link [' + code + '] copied to clipboard');
        } else {
            QN.toast('Copy failed - the link is: ' + link, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Join class modal                                                   */
    /* ------------------------------------------------------------------ */

    function openJoinModal() {
        const modal = document.getElementById('joinModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeJoinModal() {
        const modal = document.getElementById('joinModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    async function handleJoinSubmit(event) {
        event.preventDefault();

        const input = document.getElementById('classCodeInput');
        const code = input ? input.value.trim() : '';
        if (!code) {
            QN.toast('Enter a class code to join.', 'error');
            return;
        }

        try {
            const data = await QN.api('/api/classes/join', {
                method: 'POST',
                body: { code: code },
                // The 401 is handled below with a friendlier message.
                skipAuthRedirect: true,
            });

            closeJoinModal();
            QN.toast(data.message || 'Successfully enrolled in class [' + code.toUpperCase() + ']!');
            if (input) input.value = '';
            applyFilters();
        } catch (err) {
            if (err.status === 401) {
                closeJoinModal();
                QN.toast('Please sign in to join a class.', 'error');
                setTimeout(function () {
                    window.location.href = '/accsetup?next=%2Fclasses';
                }, 1200);
                return;
            }
            QN.toast(err.message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Class details modal                                                */
    /* ------------------------------------------------------------------ */

    function openClassDetails(classId) {
        const card = document.querySelector('.class-card[data-id="' + classId + '"]');
        if (!card) return;

        QN.setText('detailCode', card.dataset.code);
        QN.setText('detailTitle', card.dataset.title);
        QN.setText('detailInstructor', 'Instructor: ' + (card.dataset.instructor || 'The teacher of the class'));
        QN.setText('detailStatus', card.dataset.status || 'ACTIVE');
        QN.setText('detailDepartment', card.dataset.department || '');
        QN.setText('detailSchedule', card.dataset.schedule || 'To be announced');
        QN.setText(
            'detailDescription',
            card.dataset.description || 'The teacher did not write a description for this class yet.'
        );

        // The counts of the tabs follow the class.
        const quizzes = card.dataset.quizzes || '0';
        const members = card.dataset.members || '0';

        const quizTab = document.getElementById('detailQuizCount');
        if (quizTab) quizTab.textContent = 'Assignments & Quizzes (' + quizzes + ')';

        const memberTab = document.getElementById('detailMemberCount');
        if (memberTab) memberTab.textContent = 'Classmates (' + members + ')';

        const liveBadge = document.getElementById('detailLiveBadge');
        if (liveBadge) {
            liveBadge.classList.toggle('hidden', card.dataset.live !== 'true');
        }

        const modal = document.getElementById('classDetailModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeClassDetails() {
        const modal = document.getElementById('classDetailModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    function switchDetailTab(tabKey, button) {
        QN.$$('.modal-tab-btn').forEach(function (btn) {
            btn.className =
                'modal-tab-btn px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white border-b-2 border-transparent whitespace-nowrap';
        });

        if (button) {
            button.className =
                'modal-tab-btn px-4 py-2.5 text-xs font-semibold text-brand-400 border-b-2 border-brand-500 whitespace-nowrap';
        }

        QN.$$('.tab-content').forEach(function (content) {
            content.classList.add('hidden');
        });

        const target = document.getElementById('tab' + tabKey.charAt(0).toUpperCase() + tabKey.slice(1));
        if (target) target.classList.remove('hidden');
    }

    /* ------------------------------------------------------------------ */
    /* Create class modal                                                 */
    /* ------------------------------------------------------------------ */

    function openCreateClassModal() {
        const modal = document.getElementById('createClassModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeCreateClassModal() {
        const modal = document.getElementById('createClassModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    async function handleCreateClass(event) {
        event.preventDefault();

        const code = document.getElementById('newClassCode');
        const subject = document.getElementById('newClassSubject');
        const title = document.getElementById('newClassTitle');
        const schedule = document.getElementById('newClassSchedule');
        const error = document.getElementById('createClassError');

        if (error) error.classList.add('hidden');

        try {
            const data = await QN.api('/api/classes', {
                method: 'POST',
                body: {
                    code: code ? code.value : '',
                    title: title ? title.value : '',
                    department: subject ? subject.value : '',
                    schedule: schedule ? schedule.value : '',
                },
            });

            closeCreateClassModal();
            QN.toast(data.message || 'The class was created.');

            // Show the new class.
            window.setTimeout(function () {
                window.location.reload();
            }, 900);
        } catch (err) {
            const payload = err.payload || {};
            const message = payload.errors
                ? Object.keys(payload.errors).map(function (field) { return payload.errors[field]; }).join(' ')
                : err.message;

            if (error) {
                error.textContent = message;
                error.classList.remove('hidden');
            }
            QN.toast(message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* The cards                                                          */
    /* ------------------------------------------------------------------ */

    /** The whole class card opens the details, not only its button. */
    function initClassCards() {
        const cards = QN.$$('.class-card');

        cards.forEach(function (card) {
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');

            card.addEventListener('click', function (event) {
                // The buttons inside the card keep their own behaviour.
                if (event.target.closest('button, a')) return;
                openClassDetails(card.dataset.id);
            });

            card.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openClassDetails(card.dataset.id);
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /* Expose + init                                                      */
    /* ------------------------------------------------------------------ */

    window.toggleMobileMenu = toggleMobileMenu;
    window.setViewMode = setViewMode;
    window.filterByTab = filterByTab;
    window.applyFilters = applyFilters;
    window.openJoinModal = openJoinModal;
    window.closeJoinModal = closeJoinModal;
    window.handleJoinSubmit = handleJoinSubmit;
    window.openCreateClassModal = openCreateClassModal;
    window.closeCreateClassModal = closeCreateClassModal;
    window.handleCreateClass = handleCreateClass;
    window.copyClassLink = copyClassLink;
    window.openClassDetails = openClassDetails;
    window.closeClassDetails = closeClassDetails;
    window.switchDetailTab = switchDetailTab;

    QN.onReady(function () {
        QN.icons();
        applyFilters();
        initClassCards();
    });
})();
