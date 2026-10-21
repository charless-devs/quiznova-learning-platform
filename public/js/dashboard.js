/* ==========================================================================
   QuizNova - student dashboard
   Sidebar, countdown widget, course search, task checklist and course modal.
   ========================================================================== */

(function () {
    'use strict';

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
    /* Countdown widget                                                   */
    /* ------------------------------------------------------------------ */

    function initCountdown() {
        const days = document.getElementById('cdDays');
        if (!days) return;

        let totalSeconds = 5 * 86400 + 7 * 3600 + 16 * 60 + 42;

        setInterval(function () {
            if (totalSeconds <= 0) return;
            totalSeconds -= 1;

            const d = Math.floor(totalSeconds / 86400);
            const h = Math.floor((totalSeconds % 86400) / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;

            QN.setText('cdDays', String(d).padStart(2, '0'));
            QN.setText('cdHours', String(h).padStart(2, '0'));
            QN.setText('cdMins', String(m).padStart(2, '0'));
            QN.setText('cdSecs', String(s).padStart(2, '0'));
        }, 1000);
    }

    /* ------------------------------------------------------------------ */
    /* Course search                                                      */
    /* ------------------------------------------------------------------ */

    /**
     * The dashboard keeps a search that points to the courses. The list
     * itself lives on /courses.
     */
    function filterCourses() {
        const input = document.getElementById('courseSearchInput');
        if (!input) return;

        const term = input.value.trim();
        if (!term) return;

        // One search for the classes and the quizzes.
        window.location.href = '/courses?q=' + encodeURIComponent(term);
    }

    /* ------------------------------------------------------------------ */
    /* Task checklist                                                     */
    /* ------------------------------------------------------------------ */

    function toggleTask(element) {
        const checkbox = element.querySelector('.task-checkbox');
        const title = element.querySelector('span');
        if (!checkbox) return;

        checkbox.checked = !checkbox.checked;

        if (checkbox.checked) {
            if (title) title.classList.add('line-through');
            element.classList.add('opacity-60');
        } else {
            if (title) title.classList.remove('line-through');
            element.classList.remove('opacity-60');
        }

        const totalChecked = QN.$$('.task-checkbox:checked').length;
        QN.setText('completedTaskCount', String(totalChecked));
    }

    /* ------------------------------------------------------------------ */
    /* Course cards                                                       */
    /* ------------------------------------------------------------------ */

    /* The courses have their own page now - see /js/courses.js. */

    /* ------------------------------------------------------------------ */
    /* Notifications                                                       */
    /* ------------------------------------------------------------------ */

    /** The notifications of the student: the answers and the new results. */
    async function openNotifications() {
        const modal = document.getElementById('notificationsModal');
        const list = document.getElementById('notificationList');
        if (!modal || !list) return;

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        list.innerHTML = '<p class="text-sm text-slate-400">Loading...</p>';

        try {
            const [messages, profile] = await Promise.all([
                QN.api('/api/messages'),
                QN.api('/api/profile'),
            ]);

            const items = [];

            (messages.messages || []).forEach(function (message) {
                if (message.status === 'open') {
                    items.push({
                        icon: 'message-square',
                        color: 'text-brand-400',
                        title: 'Your message is waiting for the QuizNova admin',
                        text: message.subject,
                        link: '/messages',
                    });
                } else if (message.reply) {
                    items.push({
                        icon: 'reply',
                        color: 'text-emerald-400',
                        title: 'The QuizNova admin answered you',
                        text: message.reply,
                        link: '/messages',
                    });
                }
            });

            (profile.progress.recent || []).forEach(function (item) {
                items.push({
                    icon: 'check-circle-2',
                    color: item.score >= 70 ? 'text-emerald-400' : 'text-amber-400',
                    title: item.title + ' - ' + item.score + '%',
                    text: item.date,
                    link: '/profile',
                });
            });

            if (!items.length) {
                list.innerHTML =
                    '<div class="py-8 text-center"><i data-lucide="bell-off" class="w-7 h-7 mx-auto text-slate-600"></i><p class="text-sm text-slate-400 mt-2">Nothing new for you.</p></div>';
                QN.icons();
                return;
            }

            list.innerHTML = '';

            items.forEach(function (item) {
                const link = document.createElement('a');
                link.href = item.link;
                link.className = 'flex items-start gap-3 p-3 rounded-xl border border-borderBg bg-inputBg/50 hover:bg-hoverBg transition-colors';

                const icon = document.createElement('div');
                icon.className = 'w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0';
                icon.innerHTML = '<i data-lucide="' + item.icon + '" class="w-4 h-4 ' + item.color + '"></i>';

                const text = document.createElement('div');
                text.className = 'min-w-0';

                const title = document.createElement('p');
                title.className = 'text-xs font-bold text-white truncate';
                title.textContent = item.title;

                const body = document.createElement('p');
                body.className = 'text-[11px] text-slate-400 truncate';
                body.textContent = item.text;

                text.appendChild(title);
                text.appendChild(body);
                link.appendChild(icon);
                link.appendChild(text);
                list.appendChild(link);
            });

            QN.icons();
        } catch (err) {
            list.innerHTML = '<p class="text-sm text-rose-400">' + QN.escapeHtml(err.message) + '</p>';
        }
    }

    function closeNotifications() {
        const modal = document.getElementById('notificationsModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    /* ------------------------------------------------------------------ */
    /* Expose + init                                                      */
    /* ------------------------------------------------------------------ */

    window.toggleMobileMenu = toggleMobileMenu;
    window.filterCourses = filterCourses;
    window.toggleTask = toggleTask;
    window.openNotifications = openNotifications;
    window.closeNotifications = closeNotifications;

    QN.onReady(function () {
        QN.icons();
        initCountdown();
    });
})();
