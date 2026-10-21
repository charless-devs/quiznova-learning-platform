/* ==========================================================================
   QuizNova - messages
   The QuizNova Support thread reaches the admin, the other threads are a
   demo.
   ========================================================================== */

(function () {
    'use strict';

    let activeThread = 'support';

    /* ------------------------------------------------------------------ */
    /* Filters                                                             */
    /* ------------------------------------------------------------------ */

    function initSearch() {
        const input = document.getElementById('conversationSearch');
        if (!input) return;

        input.addEventListener(
            'input',
            QN.debounce(function () {
                const term = input.value.trim().toLowerCase();

                QN.$$('[data-conversation]').forEach(function (conversation) {
                    const haystack = conversation.getAttribute('data-search') || '';
                    conversation.classList.toggle('is-hidden', !!term && haystack.indexOf(term) === -1);
                });
            }, 150)
        );
    }

    /* ------------------------------------------------------------------ */
    /* The conversation list                                               */
    /* ------------------------------------------------------------------ */

    function selectConversation(conversation) {
        const conversations = QN.$$('[data-conversation]');

        conversations.forEach(function (other) {
            other.classList.toggle('is-active', other === conversation);
        });

        activeThread = conversation.getAttribute('data-thread') || 'local';

        // The header follows the conversation.
        QN.setText('threadName', conversation.getAttribute('data-name') || '');
        QN.setText('threadRole', conversation.getAttribute('data-role') || '');

        const avatar = document.getElementById('threadAvatar');
        if (avatar) {
            avatar.textContent = conversation.getAttribute('data-initials') || '';
            avatar.style.backgroundColor = conversation.getAttribute('data-color') || '#7c3aed';
        }

        // Only one thread is visible at a time.
        const support = document.getElementById('supportThread');
        const demo = document.getElementById('demoThread');
        if (support) support.classList.toggle('hidden', activeThread !== 'support');
        if (demo) demo.classList.toggle('hidden', activeThread === 'support');

        const input = document.getElementById('messageInput');
        if (input) {
            input.placeholder =
                activeThread === 'support' ? 'Ask QuizNova Support...' : 'Write a message...';
        }

        const badge = conversation.querySelector('.qn-badge');
        if (badge) badge.remove();
    }

    function initConversations() {
        const conversations = QN.$$('[data-conversation]');

        conversations.forEach(function (conversation) {
            conversation.addEventListener('click', function () {
                selectConversation(conversation);
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /* The composer                                                        */
    /* ------------------------------------------------------------------ */

    function appendBubble(text, outgoing, time) {
        const thread = document.getElementById(activeThread === 'support' ? 'supportThread' : 'demoThread');
        if (!thread) return;

        const bubble = document.createElement('div');
        bubble.className = 'qn-bubble ' + (outgoing ? 'is-outgoing' : 'is-incoming');

        const paragraph = document.createElement('p');
        paragraph.textContent = text;

        const stamp = document.createElement('span');
        stamp.className = 'qn-bubble__time';
        stamp.textContent =
            time ||
            new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        bubble.appendChild(paragraph);
        bubble.appendChild(stamp);
        thread.appendChild(bubble);
        thread.scrollTop = thread.scrollHeight;
    }

    /** Sends a message to QuizNova Support - the admin reads it. */
    async function sendToSupport(text) {
        const data = await QN.api('/api/messages', {
            method: 'POST',
            body: {
                subject: 'QuizNova Support',
                body: text,
                category: 'support',
            },
        });

        const message = data.message || {};
        appendBubble(text, true, String(message.created_at || '').slice(11, 16));
        QN.toast('Your message reached the QuizNova admin.');
    }

    function initComposer() {
        const input = document.getElementById('messageInput');
        const send = document.getElementById('sendMessage');
        if (!input || !send) return;

        const submit = async function () {
            const text = input.value.trim();
            if (!text) return;

            input.value = '';

            if (activeThread === 'support') {
                try {
                    await sendToSupport(text);
                } catch (err) {
                    input.value = text;
                    QN.toast(err.message, 'error');
                }
                return;
            }

            appendBubble(text, true);
            window.setTimeout(function () {
                appendBubble('Got it, thanks for the update!', false);
            }, 700);
        };

        send.addEventListener('click', submit);

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Realtime                                                            */
    /* ------------------------------------------------------------------ */

    /** Shows whether a member of the admin team is online. */
    function showPresence(payload) {
        const role = document.getElementById('threadRole');
        if (!role) return;

        const admins = payload && payload.admins ? payload.admins : 0;

        if (admins > 0) {
            role.textContent = 'A QuizNova admin is online right now';
            role.classList.add('text-emerald-400');
        } else if (role.dataset.base) {
            role.textContent = role.dataset.base;
            role.classList.remove('text-emerald-400');
        }
    }

    /** The answer of the admin arrives without a reload. */
    function onReply(payload) {
        if (!payload || !payload.reply) return;

        appendBubble(payload.reply, false, 'QuizNova Support');
        QN.toast('The QuizNova admin answered your message.');
    }

    function initRealtime() {
        QN.realtime.connect(['message:reply', 'presence']);

        QN.realtime.on('message:reply', onReply);
        QN.realtime.on('presence', showPresence);
    }

    QN.onReady(function () {
        QN.icons();
        initSearch();
        initConversations();
        initComposer();

        // Remember the original subtitle so the presence can be restored.
        const role = document.getElementById('threadRole');
        if (role) role.dataset.base = role.textContent.trim();

        initRealtime();

        const support = document.querySelector('[data-thread="support"]');
        if (support) selectConversation(support);
    });
})();
