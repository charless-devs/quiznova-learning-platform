/* ==========================================================================
   QuizNova - admin message inbox
   Reads a message, answers it and closes it.
   ========================================================================== */

(function () {
    'use strict';

    let messages = [];
    let activeId = null;

    /* ------------------------------------------------------------------ */
    /* Load                                                               */
    /* ------------------------------------------------------------------ */

    async function loadMessages() {
        try {
            const data = await QN.api('/api/admin/messages');
            messages = data.messages || [];
            renderList();
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* The list                                                            */
    /* ------------------------------------------------------------------ */

    function renderList() {
        const list = document.getElementById('messageList');
        if (!list) return;

        list.innerHTML = '';

        messages.forEach(function (message) {
            const button = document.createElement('button');
            button.className = 'qn-message' + (message.id === activeId ? ' is-selected' : '');
            button.setAttribute('data-status', message.status);
            button.setAttribute('data-id', message.id);

            const subject = document.createElement('span');
            subject.className = 'flex items-center justify-between gap-2';
            subject.innerHTML =
                '<span class="qn-message__subject text-xs font-bold text-slate-300 truncate"></span>' +
                '<span class="qn-status is-' + message.status + '"></span>';
            subject.querySelector('.qn-message__subject').textContent = message.subject;
            subject.querySelector('.qn-status').textContent = message.status;

            const preview = document.createElement('span');
            preview.className = 'block text-[11px] text-slate-400 truncate mt-1';
            preview.textContent = message.full_name + ' - ' + message.body;

            const meta = document.createElement('span');
            meta.className = 'flex items-center justify-between gap-2 mt-2';
            const mail = document.createElement('span');
            mail.className = 'text-[10px] text-slate-500';
            mail.textContent = message.email;
            const date = document.createElement('span');
            date.className = 'text-[10px] text-slate-500';
            date.textContent = String(message.created_at).slice(0, 16);
            meta.appendChild(mail);
            meta.appendChild(date);

            button.appendChild(subject);
            button.appendChild(preview);
            button.appendChild(meta);

            button.addEventListener('click', function () {
                select(message.id);
            });

            list.appendChild(button);
        });
    }

    /* ------------------------------------------------------------------ */
    /* The detail                                                          */
    /* ------------------------------------------------------------------ */

    function select(id) {
        const message = messages.find(function (item) {
            return item.id === id;
        });
        if (!message) return;

        activeId = id;

        QN.setText('detailSubject', message.subject);
        QN.setText('detailStudent', message.full_name + ' (' + message.email + ') - ' + message.category);
        QN.setText('detailBodyText', message.body);
        QN.setText('detailDate', String(message.created_at).slice(0, 16));

        const status = document.getElementById('detailStatus');
        if (status) {
            status.className = 'qn-status is-' + message.status;
            status.textContent = message.status;
        }

        const replyBox = document.getElementById('detailReplyBox');
        const replyText = document.getElementById('detailReplyText');
        if (replyBox && replyText) {
            replyText.textContent = message.reply || '';
            replyBox.classList.toggle('hidden', !message.reply);
        }

        const replyInput = document.getElementById('replyText');
        if (replyInput) replyInput.value = message.reply || '';

        const body = document.getElementById('detailBody');
        const empty = document.getElementById('detailEmpty');
        if (body) body.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        renderList();
    }

    /* ------------------------------------------------------------------ */
    /* Answer + close                                                      */
    /* ------------------------------------------------------------------ */

    async function sendReply(status) {
        if (!activeId) return;

        const input = document.getElementById('replyText');
        const error = document.getElementById('replyError');
        const reply = input ? input.value.trim() : '';

        if (status !== 'closed' && !reply) {
            if (error) {
                error.textContent = 'Please write a reply first.';
                error.classList.remove('hidden');
            }
            return;
        }

        if (error) error.classList.add('hidden');

        try {
            const data = await QN.api('/api/admin/messages/' + activeId + '/reply', {
                method: 'POST',
                body: { reply: reply, status: status },
            });

            messages = messages.map(function (item) {
                return item.id === data.message.id ? data.message : item;
            });

            renderList();
            select(data.message.id);
            QN.toast(status === 'closed' ? 'Message closed.' : 'Reply sent to the student.');
        } catch (err) {
            if (error) {
                error.textContent = err.message;
                error.classList.remove('hidden');
            }
            QN.toast(err.message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Filters                                                             */
    /* ------------------------------------------------------------------ */

    function initFilters() {
        const filters = QN.$$('.qn-filter');

        filters.forEach(function (filter) {
            filter.addEventListener('click', function () {
                filters.forEach(function (other) {
                    other.classList.toggle('is-active', other === filter);
                });

                const status = filter.getAttribute('data-status');
                let visible = 0;

                QN.$$('[data-message]').forEach(function (item) {
                    const show = status === 'all' || item.getAttribute('data-status') === status;
                    item.classList.toggle('is-hidden', !show);
                    if (show) visible += 1;
                });

                const empty = document.getElementById('inboxEmpty');
                if (empty) empty.classList.toggle('hidden', visible !== 0);
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /* Realtime                                                            */
    /* ------------------------------------------------------------------ */

    /** A student wrote a message - the inbox updates itself. */
    function onNewMessage(payload) {
        loadMessages().then(function () {
            if (!messages.length) return;

            const open = messages.filter(function (item) {
                return item.status === 'open';
            }).length;

            const counter = document.getElementById('openCounter');
            if (counter) counter.textContent = open;

            QN.toast(
                'New message from ' + (payload.user_name || 'a student') + ': ' + (payload.subject || '')
            );

            // Show it right away.
            const message = messages.find(function (item) {
                return item.id === payload.id;
            });
            if (message) select(message.id);
        });
    }

    function initRealtime() {
        QN.realtime.connect(['message:new']);

        QN.realtime.on('message:new', onNewMessage);
    }

    QN.onReady(function () {
        QN.icons();
        initFilters();

        const send = document.getElementById('sendReply');
        if (send) send.addEventListener('click', function () { sendReply('answered'); });

        const close = document.getElementById('closeMessage');
        if (close) close.addEventListener('click', function () { sendReply('closed'); });

        loadMessages().then(function () {
            if (messages.length) select(messages[0].id);
        });

        initRealtime();
    });
})();
