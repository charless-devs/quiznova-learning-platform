'use strict';

/**
 * QuizNova - authentication API.
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 */

const express = require('express');

const db = require('../conn');
const { hashPassword, verifyPassword } = require('../utils/password');
const settings = require('../utils/settings');
const { startSession, endSession, publicUser, requireAuth, landingFor, isSecureRequest } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalise(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function usernameFromEmail(email, fullName) {
    const base = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase() || 'student';
    const fallback = fullName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'student';
    return base.length >= 3 ? base : `${fallback}${Date.now() % 1000}`;
}

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

router.post('/register', async (req, res) => {
    const fullName = normalise(req.body.fullName);
    const email = normalise(req.body.email).toLowerCase();
    const username = normalise(req.body.username).toLowerCase();
    const subject = normalise(req.body.subject);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    // The admin can close the registration or put the site in maintenance.
    const platform = await settings.readAll(db);
    if (platform.maintenance === '1') {
        return res.status(503).json({
            ok: false,
            error: 'QuizNova is in maintenance mode right now - please try again later.',
        });
    }
    if (platform.registration_open === '0') {
        return res.status(403).json({
            ok: false,
            error: 'New accounts are closed at the moment. Please come back later.',
        });
    }

    const errors = {};
    if (!fullName) errors.fullName = 'Full Name is required.';
    if (!email || !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
    if (password.length < 6) errors.password = 'Password must be at least 6 characters.';
    if (Object.keys(errors).length) {
        return res.status(400).json({ ok: false, error: 'Please check the highlighted fields.', errors });
    }

    try {
        const duplicate = await db.query('SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1', [
            email,
            username || usernameFromEmail(email, fullName),
        ]);

        if (duplicate.length) {
            return res.status(409).json({
                ok: false,
                error: 'An account with that email already exists.',
                errors: { email: 'That email is already registered.' },
            });
        }

        const finalUsername = username || usernameFromEmail(email, fullName);
        const passwordHash = await hashPassword(password);

        const result = await db.execute(
            'INSERT INTO users (full_name, username, email, password_hash, role, subject) VALUES (?, ?, ?, ?, ?, ?)',
            [fullName, finalUsername, email, passwordHash, 'student', subject || null]
        );

        const user = await db.one('SELECT * FROM users WHERE id = ?', [result.insertId]);

        // A new account stays signed in for a week (the sign up form has no
        // "remember me" box).
        const remember = req.body.remember === undefined ? true : req.body.remember === true;
        startSession(res, user, remember, { secure: isSecureRequest(req) });

        return res.status(201).json({
            ok: true,
            user: publicUser(user),
            redirectTo: landingFor(user, req.body.next),
        });
    } catch (err) {
        console.error('[auth] register failed:', err.message);
        return res.status(503).json({
            ok: false,
            error: err.message || 'Could not create the account right now.',
        });
    }
});

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

router.post('/login', async (req, res) => {
    const identifier = normalise(req.body.identifier).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
        return res.status(400).json({
            ok: false,
            error: 'Enter your username or email and your password.',
            errors: {
                identifier: identifier ? undefined : 'Please enter your username or email.',
                password: password ? undefined : 'Please enter your password.',
            },
        });
    }

    try {
        const user = await db.one('SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1', [
            identifier,
            identifier,
        ]);

        if (!user) {
            return res.status(401).json({
                ok: false,
                error: 'Those credentials do not match our records.',
                errors: { identifier: 'No account found for that username or email.' },
            });
        }

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({
                ok: false,
                error: 'Those credentials do not match our records.',
                errors: { password: 'That password is incorrect.' },
            });
        }

        startSession(res, user, req.body.remember === true, { secure: isSecureRequest(req) });
        return res.json({
            ok: true,
            user: publicUser(user),
            redirectTo: landingFor(user, req.body.next),
        });
    } catch (err) {
        console.error('[auth] login failed:', err.message);
        return res.status(503).json({
            ok: false,
            error: err.message || 'Could not sign you in right now.',
        });
    }
});

/* ------------------------------------------------------------------ */
/* Logout + current user                                              */
/* ------------------------------------------------------------------ */

router.post('/logout', (req, res) => {
    endSession(res, { secure: isSecureRequest(req) });
    res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
    res.json({ ok: true, user: req.user, redirectTo: landingFor(req.user) });
});

/** Changes the password of the signed-in account. */
router.post('/password', requireAuth, async (req, res) => {
    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword) {
        return res.status(400).json({
            ok: false,
            error: 'Please check the highlighted fields.',
            errors: { currentPassword: 'Enter your current password.' },
        });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({
            ok: false,
            error: 'Please check the highlighted fields.',
            errors: { newPassword: 'The new password must be at least 6 characters.' },
        });
    }

    try {
        const user = await db.one('SELECT id, password_hash FROM users WHERE id = ?', [req.user.uid]);
        if (!user) {
            return res.status(404).json({ ok: false, error: 'That account does not exist.' });
        }

        const valid = await verifyPassword(currentPassword, user.password_hash);
        if (!valid) {
            return res.status(401).json({
                ok: false,
                error: 'Your current password is not right.',
                errors: { currentPassword: 'That password is not correct.' },
            });
        }

        const hash = await hashPassword(newPassword);
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);

        return res.json({ ok: true, message: 'Your password was changed.' });
    } catch (err) {
        console.error('[auth] password change failed:', err.message);
        return res.status(503).json({ ok: false, error: err.message || 'Could not change the password.' });
    }
});

module.exports = router;
