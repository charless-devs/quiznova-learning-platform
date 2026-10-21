/* ==========================================================================
   QuizNova - the account of the administrator
   The profile, the password and the preferences of the portal.
   ========================================================================== */

(function () {
    'use strict';

    const state = {
        lightMode: false,
        emails: true,
        liveBadge: true,
    };

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    function field(id) {
        return document.getElementById(id);
    }

    function showPasswordError(message) {
        const error = field('accountPasswordError');
        if (!error) return;

        error.textContent = message || '';
        error.classList.toggle('hidden', !message);
    }

    /** Puts a switch in the state it shows. */
    function setSwitch(id, on) {
        const button = field(id);
        if (!button) return;

        button.classList.toggle('is-on', !!on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    /** Is the switch on? */
    function switchState(id) {
        const button = field(id);
        return !!(button && button.classList.contains('is-on'));
    }

    /* ------------------------------------------------------------------ */
    /* The profile                                                         */
    /* ------------------------------------------------------------------ */

    async function saveName() {
        const name = field('accountName');
        const subject = field('accountSubject');

        const fullName = name ? name.value.trim() : '';
        if (!fullName) {
            QN.toast('A name is needed.', 'error');
            return;
        }

        try {
            await QN.api('/api/profile', {
                method: 'PATCH',
                body: {
                    fullName: fullName,
                    subject: subject ? subject.value.trim() : '',
                },
            });

            QN.toast('Your account is saved.');
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* The password                                                         */
    /* ------------------------------------------------------------------ */

    async function changePassword() {
        const current = field('accountCurrentPassword');
        const next = field('accountNewPassword');

        showPasswordError('');

        if (!current || !next || !current.value) {
            showPasswordError('Enter your current password.');
            return;
        }

        if (next.value.length < 6) {
            showPasswordError('The new password must have at least 6 characters.');
            return;
        }

        try {
            await QN.api('/api/auth/password', {
                method: 'POST',
                body: {
                    currentPassword: current.value,
                    newPassword: next.value,
                },
            });

            current.value = '';
            next.value = '';
            QN.toast('Your password is changed.');
        } catch (err) {
            showPasswordError(err.message);
        }
    }

    /* ------------------------------------------------------------------ */
    /* The preferences                                                      */
    /* ------------------------------------------------------------------ */

    async function savePreferences() {
        state.lightMode = switchState('accountLightMode');
        state.emails = switchState('accountEmails');
        state.liveBadge = switchState('accountLiveBadge');

        try {
            await QN.api('/api/profile/preferences', {
                method: 'PUT',
                body: {
                    theme: state.lightMode ? 'light' : 'dark',
                    email_notifications: state.emails ? 1 : 0,
                    show_progress: state.liveBadge ? 1 : 0,
                },
            });

            // The light mode of the whole site follows the switch right away.
            if (typeof QN.setTheme === 'function') {
                QN.setTheme(state.lightMode ? 'light' : 'dark');
                try {
                    window.localStorage.setItem('qn-theme', state.lightMode ? 'light' : 'dark');
                } catch (err) {
                    /* private mode */
                }
            }

            QN.toast('Your preferences are saved.');
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Init                                                                 */
    /* ------------------------------------------------------------------ */

    QN.onReady(function () {
        if (!field('accountName')) return;

        QN.icons();

        // The switches follow the theme of the portal right now.
        const isLight = document.documentElement.classList.contains('light');
        setSwitch('accountLightMode', isLight);
        setSwitch('accountEmails', true);
        setSwitch('accountLiveBadge', true);

        ['accountLightMode', 'accountEmails', 'accountLiveBadge'].forEach(function (id) {
            const button = field(id);
            if (!button) return;

            button.addEventListener('click', function () {
                const on = !button.classList.contains('is-on');
                setSwitch(id, on);
            });
        });

        const save = field('accountSaveName');
        if (save) save.addEventListener('click', saveName);

        const password = field('accountChangePassword');
        if (password) password.addEventListener('click', changePassword);

        const preferences = field('accountSavePreferences');
        if (preferences) preferences.addEventListener('click', savePreferences);
    });
})();
