/* ==========================================================================
   QuizNova - registration / login portal
   The forms post to /api/auth/* so accounts are really stored in MySQL.
   ========================================================================== */

(function () {
    'use strict';

    const quotes = [
        {
            text: '"Knowledge is power. Information is liberating. Education is the premise of progress."',
            author: '- Kofi Annan',
        },
        {
            text: '"The beautiful thing about learning is that no one can take it away from you."',
            author: '- B.B. King',
        },
        {
            text: '"Live as if you were to die tomorrow. Learn as if you were to live forever."',
            author: '- Mahatma Gandhi',
        },
    ];

    let isLoginView = true;
    let currentQuoteIndex = 0;

    /* ------------------------------------------------------------------ */
    /* View switching                                                     */
    /* ------------------------------------------------------------------ */

    function toggleAuthMode() {
        isLoginView = !isLoginView;

        const loginView = document.getElementById('loginView');
        const registerView = document.getElementById('registerView');

        if (isLoginView) {
            registerView.classList.add('hidden');
            loginView.classList.remove('hidden');
            QN.setText('headerSwitchText', 'New here?');
            QN.setText('headerSwitchBtn', 'Create account');
            document.getElementById('portalBannerTitle').innerHTML = 'Welcome to <br/>student portal';
            QN.setText(
                'portalBannerDesc',
                'Log in to access your customized quizzes, stats, and achievements.'
            );
        } else {
            loginView.classList.add('hidden');
            registerView.classList.remove('hidden');
            QN.setText('headerSwitchText', 'Already registered?');
            QN.setText('headerSwitchBtn', 'Sign in');
            document.getElementById('portalBannerTitle').innerHTML =
                'Join QuizNova <br/>learning community';
            QN.setText(
                'portalBannerDesc',
                'Create an account today to unlock interactive quizzes and earn verified badges.'
            );
        }

        rotateQuote();
    }

    function togglePasswordVisibility(inputId, iconId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);
        if (!input || !icon) return;

        if (input.type === 'password') {
            input.type = 'text';
            icon.setAttribute('data-lucide', 'eye-off');
        } else {
            input.type = 'password';
            icon.setAttribute('data-lucide', 'eye');
        }
        QN.icons();
    }

    /* ------------------------------------------------------------------ */
    /* Validation helpers                                                 */
    /* ------------------------------------------------------------------ */

    function setError(id, message) {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = message || '';
        element.classList.toggle('hidden', !message);
    }

    function clearErrors(ids) {
        ids.forEach(function (id) {
            setError(id, '');
        });
    }

    function setButtonLoading(buttonId, loading, html) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        button.disabled = loading;
        button.innerHTML = html;
        QN.icons();
    }

    /* ------------------------------------------------------------------ */
    /* Login                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Where to go after a successful sign in.
     *
     * Administrators land on the admin portal, every other account on the
     * student dashboard. The server sends the resolved target in
     * `redirectTo`; the fallback below keeps the page working on its own.
     */
    function destination(user, redirectTo) {
        if (redirectTo) return redirectTo;
        if (typeof QN.landingFor === 'function') return QN.landingFor(user);

        const role = user && user.role ? user.role : 'student';
        return role === 'admin' ? '/admin' : '/dashboard';
    }

    async function handleLoginSubmit(event) {
        event.preventDefault();
        clearErrors(['loginIdentifierError', 'loginPasswordError']);

        const identifierInput = document.getElementById('loginIdentifier');
        const passwordInput = document.getElementById('loginPassword');
        const identifier = identifierInput.value.trim();
        const password = passwordInput.value;
        const remember = document.getElementById('rememberMe').checked;

        let valid = true;
        if (!identifier) {
            setError('loginIdentifierError', 'Please enter your username or email.');
            valid = false;
        }
        if (!password) {
            setError('loginPasswordError', 'Please enter your password.');
            valid = false;
        }
        if (!valid) return;

        setButtonLoading(
            'loginBtn',
            true,
            '<i data-lucide="loader-2" class="w-4 h-4 qn-spin"></i><span>Signing in...</span>'
        );

        try {
            const data = await QN.api('/api/auth/login', {
                method: 'POST',
                body: {
                    identifier: identifier,
                    password: password,
                    remember: remember,
                    next: typeof QN.getNextUrl === 'function' ? QN.getNextUrl() : '',
                },
            });

            QN.toast('Welcome back, ' + (data.user && data.user.fullName ? data.user.fullName : identifier) + '!');
            setTimeout(function () {
                window.location.href = destination(data.user, data.redirectTo);
            }, 700);
        } catch (err) {
            const payload = err.payload || {};
            if (payload.errors) {
                if (payload.errors.identifier) setError('loginIdentifierError', payload.errors.identifier);
                if (payload.errors.password) setError('loginPasswordError', payload.errors.password);
            }
            QN.toast(err.message, 'error');
            setButtonLoading(
                'loginBtn',
                false,
                '<span>Sign In to Portal</span><i data-lucide="arrow-right" class="w-4 h-4"></i>'
            );
        }
    }

    /* ------------------------------------------------------------------ */
    /* Register                                                           */
    /* ------------------------------------------------------------------ */

    async function handleRegisterSubmit(event) {
        event.preventDefault();
        clearErrors([
            'regFullNameError',
            'regEmailError',
            'regSubjectError',
            'regPasswordError',
            'regConfirmPasswordError',
            'termsError',
        ]);

        const fullName = document.getElementById('regFullName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const subject = document.getElementById('regSubject').value;
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;
        const termsAgree = document.getElementById('termsAgree').checked;

        let valid = true;
        if (!fullName) {
            setError('regFullNameError', 'Full Name is required.');
            valid = false;
        }
        if (!email || !email.includes('@')) {
            setError('regEmailError', 'Enter a valid email address.');
            valid = false;
        }
        if (!subject) {
            setError('regSubjectError', 'Please select a primary subject.');
            valid = false;
        }
        if (!password || password.length < 6) {
            setError('regPasswordError', 'Password must be at least 6 characters.');
            valid = false;
        }
        if (password !== confirmPassword) {
            setError('regConfirmPasswordError', 'Passwords do not match.');
            valid = false;
        }
        if (!termsAgree) {
            setError('termsError', 'You must agree to the Terms of Service.');
            valid = false;
        }
        if (!valid) return;

        setButtonLoading(
            'regBtn',
            true,
            '<i data-lucide="loader-2" class="w-4 h-4 qn-spin"></i><span>Creating Account...</span>'
        );

        try {
            const data = await QN.api('/api/auth/register', {
                method: 'POST',
                body: {
                    fullName: fullName,
                    email: email,
                    subject: subject,
                    password: password,
                    next: typeof QN.getNextUrl === 'function' ? QN.getNextUrl() : '',
                },
            });

            QN.toast('Account created for ' + (data.user && data.user.fullName ? data.user.fullName : fullName) + '!');

            document.getElementById('registerForm').reset();
            toggleAuthMode();

            setTimeout(function () {
                window.location.href = destination(data.user, data.redirectTo);
            }, 900);
        } catch (err) {
            const payload = err.payload || {};
            if (payload.errors) {
                Object.keys(payload.errors).forEach(function (field) {
                    const map = {
                        fullName: 'regFullNameError',
                        email: 'regEmailError',
                        password: 'regPasswordError',
                    };
                    if (map[field]) setError(map[field], payload.errors[field]);
                });
            }
            QN.toast(err.message, 'error');
            setButtonLoading(
                'regBtn',
                false,
                '<span>Register Account</span><i data-lucide="check-circle-2" class="w-4 h-4"></i>'
            );
        }
    }

    /* ------------------------------------------------------------------ */
    /* Forgot password                                                    */
    /* ------------------------------------------------------------------ */

    function openForgotModal() {
        const modal = document.getElementById('forgotModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeForgotModal() {
        const modal = document.getElementById('forgotModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    function handleForgotSubmit(event) {
        event.preventDefault();
        const email = document.getElementById('forgotEmail').value.trim();

        closeForgotModal();
        QN.toast(
            email
                ? 'Password recovery instructions sent to ' + email
                : 'Enter your email address to reset your password.'
        );
        document.getElementById('forgotEmail').value = '';
    }

    /* ------------------------------------------------------------------ */
    /* Social auth (demo)                                                 */
    /* ------------------------------------------------------------------ */

    function triggerSocialAuth(provider) {
        QN.toast('Connecting with ' + provider + '... Please wait.');
    }

    /* ------------------------------------------------------------------ */
    /* Quote rotator                                                      */
    /* ------------------------------------------------------------------ */

    function rotateQuote() {
        currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;

        const quoteBox = document.getElementById('quoteBox');
        if (!quoteBox) return;
        quoteBox.style.opacity = '0';

        setTimeout(function () {
            QN.setText('quoteText', quotes[currentQuoteIndex].text);
            QN.setText('quoteAuthor', quotes[currentQuoteIndex].author);
            quoteBox.style.opacity = '1';
        }, 200);
    }

    /* ------------------------------------------------------------------ */
    /* Expose + init                                                      */
    /* ------------------------------------------------------------------ */

    window.toggleAuthMode = toggleAuthMode;
    window.togglePasswordVisibility = togglePasswordVisibility;
    window.handleLoginSubmit = handleLoginSubmit;
    window.handleRegisterSubmit = handleRegisterSubmit;
    window.openForgotModal = openForgotModal;
    window.closeForgotModal = closeForgotModal;
    window.handleForgotSubmit = handleForgotSubmit;
    window.triggerSocialAuth = triggerSocialAuth;
    window.rotateQuote = rotateQuote;

    QN.onReady(function () {
        QN.icons();
        rotateQuote();
    });
})();
