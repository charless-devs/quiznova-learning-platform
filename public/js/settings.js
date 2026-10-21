/* ==========================================================================
   QuizNova - student settings
   The profile, the preferences and the password.
   ========================================================================== */

(function () {
    'use strict';

    /* ------------------------------------------------------------------ */
    /* The profile                                                         */
    /* ------------------------------------------------------------------ */

    async function saveProfile() {
        const name = document.getElementById('settingName');
        const subject = document.getElementById('settingSubject');
        const error = document.getElementById('profileError');

        if (error) error.classList.add('hidden');

        try {
            const data = await QN.api('/api/profile', {
                method: 'PATCH',
                body: {
                    fullName: name ? name.value : '',
                    subject: subject ? subject.value : '',
                },
            });

            if (name && data.user) name.value = data.user.full_name;

            QN.toast('Your profile is saved.');
        } catch (err) {
            const payload = err.payload || {};
            const message = payload.errors
                ? Object.keys(payload.errors)
                      .map(function (field) {
                          return payload.errors[field];
                      })
                      .join(' ')
                : err.message;

            if (error) {
                error.textContent = message;
                error.classList.remove('hidden');
            }
            QN.toast(message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* The preferences                                                     */
    /* ------------------------------------------------------------------ */

    function collectPreferences() {
        const preferences = {};

        const theme = document.querySelector('.qn-theme-option.is-active');
        if (theme) preferences.theme = theme.getAttribute('data-theme');

        QN.$$('.qn-switch').forEach(function (toggle) {
            preferences[toggle.getAttribute('data-preference')] = toggle.classList.contains('is-on') ? 1 : 0;
        });

        const goal = document.getElementById('settingDailyGoal');
        if (goal) preferences.daily_goal = Number(goal.value);

        return preferences;
    }

    async function savePreferences() {
        try {
            const data = await QN.api('/api/profile/preferences', {
                method: 'PUT',
                body: collectPreferences(),
            });

            QN.toast('Your preferences are saved.');

            // The theme applies right away.
            const theme = data.preferences && data.preferences.theme;
            if (theme) QN.setTheme(theme);
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* The password                                                        */
    /* ------------------------------------------------------------------ */

    async function changePassword() {
        const current = document.getElementById('currentPassword');
        const next = document.getElementById('newPassword');
        const error = document.getElementById('passwordError');

        if (error) error.classList.add('hidden');

        try {
            await QN.api('/api/auth/password', {
                method: 'POST',
                body: {
                    currentPassword: current ? current.value : '',
                    newPassword: next ? next.value : '',
                },
            });

            if (current) current.value = '';
            if (next) next.value = '';

            QN.toast('Your password was changed.');
        } catch (err) {
            const payload = err.payload || {};
            const message = payload.errors
                ? Object.keys(payload.errors)
                      .map(function (field) {
                          return payload.errors[field];
                      })
                      .join(' ')
                : err.message;

            if (error) {
                error.textContent = message;
                error.classList.remove('hidden');
            }
            QN.toast(message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Init                                                                */
    /* ------------------------------------------------------------------ */

    function initControls() {
        const goal = document.getElementById('settingDailyGoal');
        const goalValue = document.getElementById('dailyGoalValue');

        if (goal && goalValue) {
            goal.addEventListener('input', function () {
                goalValue.textContent = goal.value + ' / day';
            });
        }

        // The theme buttons switch the theme right away.
        QN.$$('.qn-theme-option').forEach(function (option) {
            option.addEventListener('click', function () {
                QN.$$('.qn-theme-option').forEach(function (other) {
                    other.classList.toggle('is-active', other === option);
                });

                QN.setTheme(option.getAttribute('data-theme'));
            });
        });

        QN.$$('.qn-switch').forEach(function (toggle) {
            toggle.addEventListener('click', function () {
                const on = !toggle.classList.contains('is-on');
                toggle.classList.toggle('is-on', on);
                toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        });

        const save = document.getElementById('saveProfile');
        if (save) save.addEventListener('click', saveProfile);

        const savePrefs = document.getElementById('savePreferences');
        if (savePrefs) savePrefs.addEventListener('click', savePreferences);

        const password = document.getElementById('changePassword');
        if (password) password.addEventListener('click', changePassword);
    }

    QN.onReady(function () {
        QN.icons();
        initControls();
    });
})();
