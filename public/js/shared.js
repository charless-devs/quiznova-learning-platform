/* ==========================================================================
   QuizNova - shared front-end helpers
   Loaded by every page before the page specific script.
   ========================================================================== */

(function (global) {
    'use strict';

    const QN = {
        version: '1.0.0',
    };

    /* ------------------------------------------------------------------ */
    /* DOM helpers                                                        */
    /* ------------------------------------------------------------------ */

    QN.$ = function (selector, scope) {
        return (scope || document).querySelector(selector);
    };

    QN.$$ = function (selector, scope) {
        return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
    };

    QN.on = function (element, event, handler, options) {
        if (element) element.addEventListener(event, handler, options);
    };

    /**
     * Resolves a target to a DOM element.
     * A plain string is treated as an element id, anything that looks like a
     * CSS selector ('#id', '.class', '[attr]') is passed to querySelector.
     */
    QN.el = function (target, scope) {
        if (!target) return null;
        if (typeof target !== 'string') return target;

        const first = target.charAt(0);
        if (first === '#' || first === '.' || first === '[') {
            return (scope || document).querySelector(target);
        }
        return (scope || document).getElementById(target);
    };

    QN.setText = function (target, value) {
        const element = QN.el(target);
        if (element) element.textContent = value;
    };

    QN.escapeHtml = function (value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /* ------------------------------------------------------------------ */
    /* Lucide icons                                                       */
    /* ------------------------------------------------------------------ */

    QN.icons = function () {
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons();
        }
    };

    /* ------------------------------------------------------------------ */
    /* Toasts                                                             */
    /* ------------------------------------------------------------------ */

    /**
     * showToast(message, type)
     * type: 'success' (default) | 'error'
     */
    QN.toast = function (message, type) {
        const container = document.getElementById('toastContainer');
        if (!container) return null;

        const kind = type === 'error' ? 'error' : 'success';
        const iconName = kind === 'error' ? 'alert-circle' : 'check-circle-2';

        const toast = document.createElement('div');
        toast.className = 'qn-toast';
        toast.setAttribute('data-type', kind);
        toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        toast.innerHTML =
            '<div class="flex items-center gap-2">' +
            '<i data-lucide="' + iconName + '" class="qn-toast__icon"></i>' +
            '<span>' + QN.escapeHtml(message) + '</span>' +
            '</div>' +
            '<button type="button" class="qn-toast__close" aria-label="Dismiss">' +
            '<i data-lucide="x"></i>' +
            '</button>';

        const dismiss = function () {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        };

        toast.querySelector('.qn-toast__close').addEventListener('click', dismiss);

        container.appendChild(toast);
        QN.icons();

        setTimeout(dismiss, kind === 'error' ? 5000 : 3200);

        return toast;
    };

    /* ------------------------------------------------------------------ */
    /* HTTP helper                                                        */
    /* ------------------------------------------------------------------ */

    /**
     * QN.api(url, options) -> Promise<data>
     * Always resolves with parsed JSON; throws an Error with .status on
     * failure so callers can show a friendly message.
     *
     * The session cookie of *this* browser is always sent, and a 401 means
     * the session is gone: the visitor is sent back to the login page
     * instead of staring at a page that half works.
     */
    QN.api = async function (url, options) {
        const config = Object.assign({ headers: {}, credentials: 'same-origin' }, options || {});

        if (config.body && typeof config.body !== 'string') {
            config.body = JSON.stringify(config.body);
            config.headers['Content-Type'] = 'application/json';
        }

        config.headers = Object.assign({ Accept: 'application/json' }, config.headers);

        let response;
        try {
            response = await fetch(url, config);
        } catch (err) {
            // The connection broke - that is not the same as a wrong answer.
            const error = new Error(
                navigator.onLine === false
                    ? 'You are offline - the request did not go through.'
                    : 'Could not reach the server. Check your connection and try again.'
            );
            error.status = 0;
            error.offline = true;
            throw error;
        }

        let payload = null;
        try {
            payload = await response.json();
        } catch (err) {
            payload = null;
        }

        if (response.status === 401 && !QN.isAuthRequest(url) && config.skipAuthRedirect !== true) {
            // The session is closed or it expired - say goodbye and reload.
            QN.showLoggedOut();
        }

        if (!response.ok || (payload && payload.ok === false)) {
            const error = new Error((payload && payload.error) || 'Request failed (' + response.status + ').');
            error.status = response.status;
            error.payload = payload;
            error.retry = true;
            throw error;
        }

        return payload || {};
    };

    /** True for the endpoints of the login form (a wrong password is a 401). */
    QN.isAuthRequest = function (url) {
        return /\/api\/auth\/(login|register|password)/.test(String(url || ''));
    };

    /**
     * Runs a button only once.
     *
     * A double click must never publish two assessments - the button is
     * disabled while the request runs and gets its label back afterwards.
     */
    QN.button = function (button, label, work) {
        if (!button || typeof work !== 'function') return Promise.resolve();

        if (button.dataset.busy === 'true') return Promise.resolve();

        const original = button.innerHTML;
        button.dataset.busy = 'true';
        button.disabled = true;
        if (label) button.innerHTML = label;

        const done = function () {
            button.dataset.busy = 'false';
            button.disabled = false;
            button.innerHTML = original;
        };

        return Promise.resolve()
            .then(function () {
                return work();
            })
            .then(
                function (result) {
                    done();
                    return result;
                },
                function (error) {
                    done();
                    throw error;
                }
            );
    };

    /**
     * Shows a message with a button to try again.
     *
     * A broken connection is the most common problem - the visitor gets a
     * button instead of a dead end.
     */
    QN.retry = function (message, work) {
        const container = field('toastContainer');
        if (!container || typeof work !== 'function') return;

        const toast = document.createElement('div');
        toast.className = 'qn-toast';
        toast.setAttribute('data-type', 'error');
        toast.setAttribute('role', 'alert');
        toast.innerHTML =
            '<div class="flex items-center gap-2">' +
            '<i data-lucide="wifi-off" class="qn-toast__icon"></i>' +
            '<span>' + QN.escapeHtml(message) + '</span>' +
            '</div>' +
            '<button type="button" class="qn-toast__close qn-toast__retry">Try again</button>';

        const dismiss = function () {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        };

        const retry = toast.querySelector('.qn-toast__retry');
        if (retry) {
            retry.addEventListener('click', function () {
                dismiss();
                work();
            });
        }

        container.appendChild(toast);
        QN.icons();

        setTimeout(dismiss, 12000);
    };

    /** The element of an id (the helper the other scripts use). */
    function field(id) {
        return document.getElementById(id);
    }

    /* ------------------------------------------------------------------ */
    /* Session                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Shows the popup that says the session is closed.
     * It waits a moment so the message can be read before the redirect.
     */
    QN.showLoggedOut = function () {
        if (document.getElementById('qnLoggedOut')) return;

        const overlay = document.createElement('div');
        overlay.id = 'qnLoggedOut';
        overlay.style.cssText =
            'position:fixed; inset:0; z-index:100; background-color:rgba(2,6,23,0.72); backdrop-filter:blur(4px);' +
            'display:flex; align-items:center; justify-content:center; padding:1rem;';

        const card = document.createElement('div');
        card.style.cssText =
            'background-color:rgb(var(--qn-card)); border:1px solid rgb(var(--qn-border)); border-radius:1rem;' +
            'width:100%; max-width:22rem; padding:1.5rem; text-align:center;';

        const icon = document.createElement('div');
        icon.style.cssText =
            'width:3.5rem; height:3.5rem; margin:0 auto 1rem; border-radius:1rem; display:flex; align-items:center;' +
            'justify-content:center; background-color:rgba(16,185,129,0.15); color:#34d399;';
        icon.innerHTML = '<i data-lucide="log-out" class="w-6 h-6"></i>';

        const title = document.createElement('h2');
        title.className = 'text-lg font-extrabold text-white';
        title.textContent = 'You are logged out';

        const text = document.createElement('p');
        text.className = 'text-sm text-slate-400 mt-1';
        text.textContent = 'Your session is closed. Thanks for learning with QuizNova!';

        const button = document.createElement('button');
        button.type = 'button';
        button.style.cssText =
            'width:100%; margin-top:1.25rem; padding:0.75rem 1rem; border-radius:0.75rem; background-color:#7c3aed;' +
            'color:#fff; font-weight:700; font-size:0.875rem; border:0; cursor:pointer;';
        button.textContent = 'Back to the login';

        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(text);
        card.appendChild(button);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        QN.icons();
        button.focus();

        let timer = null;
        const go = function () {
            if (timer) window.clearTimeout(timer);
            window.location.href = '/accsetup';
        };

        button.addEventListener('click', go);

        // The popup closes by itself when it was not touched.
        timer = window.setTimeout(go, 2600);
    };

    /** Signs the user out and says goodbye. */
    QN.logout = async function () {
        try {
            await QN.api('/api/auth/logout', { method: 'POST' });
        } catch (err) {
            // The session is cleared by redirecting either way.
        }

        QN.showLoggedOut();
    };

    /* ------------------------------------------------------------------ */
    /* Theme (dark <-> light)                                              */
    /* ------------------------------------------------------------------ */

    const THEME_KEY = 'qn-theme';

    function readTheme() {
        try {
            return window.localStorage.getItem(THEME_KEY);
        } catch (err) {
            return null;
        }
    }

    function saveTheme(theme) {
        try {
            window.localStorage.setItem(THEME_KEY, theme);
        } catch (err) {
            // Private mode - the theme just will not be remembered.
        }
    }

    /**
     * Paints the site in the given theme and updates every toggle button.
     * The theme lives on <html> so the CSS can switch every page.
     */
    QN.setTheme = function (theme) {
        const isLight = theme === 'light';
        const root = document.documentElement;

        root.classList.toggle('light', isLight);
        root.classList.toggle('dark', !isLight);
        document.body.classList.toggle('theme-light', isLight);

        QN.$$('[data-theme-toggle]').forEach(function (button) {
            const icon = button.querySelector('[data-lucide]');
            if (icon) icon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');

            const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';
            button.setAttribute('title', label);
            button.setAttribute('aria-label', label);
            button.setAttribute('aria-pressed', isLight ? 'true' : 'false');
        });

        QN.icons();

        return theme;
    };

    /**
     * Wires up the theme toggles of the current page (if it has any) and
     * restores the theme the visitor picked last time.
     */
    QN.initThemeToggle = function () {
        QN.setTheme(readTheme() === 'light' ? 'light' : 'dark');

        QN.$$('[data-theme-toggle]').forEach(function (button) {
            button.addEventListener('click', function () {
                const isLight = document.documentElement.classList.contains('light');
                const theme = isLight ? 'dark' : 'light';

                QN.setTheme(theme);
                saveTheme(theme);
            });
        });
    };

    /* ------------------------------------------------------------------ */
    /* Realtime (Server-Sent Events)                                       */
    /* ------------------------------------------------------------------ */

    /**
     * QN.realtime.connect(['message:reply'])
     *
     * Opens the event stream of the signed-in user. The browser reconnects
     * on its own, so a dropped connection heals itself.
     */
    QN.realtime = {
        source: null,

        connect: function (events) {
            if (typeof global.EventSource === 'undefined') return null;

            const list = (events || []).join(',');

            try {
                this.source = new global.EventSource('/api/events?events=' + encodeURIComponent(list));
            } catch (err) {
                return null;
            }

            const self = this;

            this.source.addEventListener('connected', function () {
                self.setState(true);
            });

            this.source.addEventListener('error', function () {
                self.setState(false);
            });

            return this.source;
        },

        /** Handles an event of the stream. */
        on: function (event, handler) {
            if (!this.source) return;

            this.source.addEventListener(event, function (message) {
                let payload = {};
                try {
                    payload = JSON.parse(message.data);
                } catch (err) {
                    payload = {};
                }
                handler(payload);
            });
        },

        /** Shows the live indicator of the page. */
        setState: function (online) {
            document.body.classList.toggle('qn-live', !!online);

            QN.$$('[data-live-indicator]').forEach(function (element) {
                element.classList.toggle('is-live', !!online);
            });
        },
    };

    /* ------------------------------------------------------------------ */
    /* Mobile sidebar                                                      */
    /* ------------------------------------------------------------------ */

    /**
     * Closes the off-canvas sidebar when one of its links is used, so the
     * page behind it is clickable again on a phone.
     */
    QN.closeSidebarOnNavigate = function () {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        const overlay = document.getElementById('mobileOverlay');

        QN.$$('a', sidebar).forEach(function (link) {
            link.addEventListener('click', function () {
                sidebar.classList.add('-translate-x-full');
                if (overlay) overlay.classList.add('hidden');
            });
        });
    };

    /* ------------------------------------------------------------------ */
    /* Misc                                                               */
    /* ------------------------------------------------------------------ */

    /** The page the user was trying to reach before being asked to sign in. */
    QN.getNextUrl = function () {
        const next = document.body && document.body.dataset ? document.body.dataset.next : '';
        // Only allow internal paths.
        if (next && next.charAt(0) === '/' && next.charAt(1) !== '/') return next;
        return '';
    };

    /** The landing page of a role: admins get the portal, students the app. */
    QN.homeForRole = function (role) {
        return role === 'admin' ? '/admin' : '/dashboard';
    };

    /**
     * Resolves where a signed-in user should land.
     * A `next` target is only honoured when it is an internal path the role
     * is allowed to open - students never follow a link into the portal.
     */
    QN.landingFor = function (user, next) {
        const home = QN.homeForRole(user && user.role);
        const target = next || QN.getNextUrl();

        if (!target || target.charAt(0) !== '/' || target.charAt(1) === '/') return home;

        const isAdminPath = target === '/admin' || target.indexOf('/admin/') === 0;
        if (isAdminPath && !(user && user.role === 'admin')) return home;

        return target;
    };

    /** Copies text to the clipboard. Resolves to true/false. */
    QN.copyToClipboard = async function (text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (err) {
            // fall through to the legacy approach
        }

        try {
            const area = document.createElement('textarea');
            area.value = text;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(area);
            return ok;
        } catch (err) {
            return false;
        }
    };

    QN.debounce = function (fn, wait) {
        let timer = null;
        return function () {
            const args = arguments;
            const context = this;
            clearTimeout(timer);
            timer = setTimeout(function () {
                fn.apply(context, args);
            }, wait || 200);
        };
    };

    QN.formatTime = function (seconds) {
        const safe = Math.max(0, Math.floor(seconds));
        const mins = Math.floor(safe / 60);
        const secs = safe % 60;
        return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    };

    QN.onReady = function (fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    };

    /* ------------------------------------------------------------------ */
    /* Expose                                                             */
    /* ------------------------------------------------------------------ */

    global.QN = QN;

    // Every page gets the theme toggle (when it has one).
    QN.onReady(function () {
        QN.initThemeToggle();
        QN.closeSidebarOnNavigate();
    });

    // Legacy alias - the EJS templates call showToast() from inline handlers.
    global.showToast = QN.toast;

    // Legacy alias - logout buttons in the EJS templates call logout().
    global.logout = QN.logout;

    // Every dialog of the app closes with the Escape key.
    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;

        QN.$$('[id$="Modal"]').forEach(function (modal) {
            if (modal.classList.contains('hidden')) return;

            modal.classList.add('hidden');
            modal.classList.remove('flex');
        });
    });
})(window);
