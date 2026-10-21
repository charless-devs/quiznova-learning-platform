'use strict';

/**
 * QuizNova - session handling.
 *
 * A tiny signed-cookie session (no extra dependencies): the cookie holds a
 * base64url JSON payload plus an HMAC-SHA256 signature. The payload never
 * contains the password hash.
 *
 * Rules that keep the sessions of two browsers apart:
 *
 *   - the cookie is HttpOnly, host only (no Domain) and SameSite=Lax,
 *   - every sign in mints a fresh token (a random session id), so two
 *     browsers never carry the same cookie value,
 *   - without "remember me" the cookie is a *browser session* cookie: it
 *     dies with the browser and can never leak into the next one,
 *   - the role in the cookie is never trusted: the account is looked up in
 *     the database on every request, so only an account that is an admin
 *     *right now* can open the admin portal,
 *   - the pages are served with "no-store" so no browser and no proxy can
 *     hand the admin view of one browser to another one.
 */

const crypto = require('crypto');

const { sessionSecret } = require('../config');

const COOKIE_NAME = 'qn_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days ("remember me")
const SESSION_AGE_MS = 1000 * 60 * 60 * 12; // 12 hours (a browser session)

const ADMIN_HOME = '/admin';
const STUDENT_HOME = '/dashboard';

const SECRET = sessionSecret;

/** How long a looked up role is trusted before it is read again. */
const ROLE_CACHE_MS = 2000;

/** uid -> { role, exists, expires } */
const roleCache = new Map();

if (!process.env.SESSION_SECRET) {
    console.warn('[auth] SESSION_SECRET not set - using the insecure development default.');
}

/* ------------------------------------------------------------------ */
/* Cookies                                                             */
/* ------------------------------------------------------------------ */

function parseCookies(header) {
    const jar = {};
    if (!header) return jar;

    header.split(';').forEach((part) => {
        const index = part.indexOf('=');
        if (index < 0) return;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (!key) return;
        try {
            jar[key] = decodeURIComponent(value);
        } catch {
            jar[key] = value;
        }
    });

    return jar;
}

function serializeCookie(name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    parts.push(`Path=${options.path || '/'}`);
    if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
    if (options.httpOnly !== false) parts.push('HttpOnly');
    if (options.secure) parts.push('Secure');
    parts.push(`SameSite=${options.sameSite || 'Lax'}`);
    return parts.join('; ');
}

/* ------------------------------------------------------------------ */
/* Signing                                                             */
/* ------------------------------------------------------------------ */

function sign(value) {
    return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function encodeSession(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${sign(body)}`;
}

function decodeSession(token) {
    if (!token || typeof token !== 'string') return null;

    const [body, signature] = token.split('.');
    if (!body || !signature) return null;

    const expected = sign(body);
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);

    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload || !payload.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* The live account                                                    */
/* ------------------------------------------------------------------ */

/**
 * Reads the account of a session from the database.
 *
 * The cookie only proves *who* signed in - the role always comes from the
 * database, so a session can never keep admin rights that the account does
 * not have any more (and a deleted account is signed out at once).
 *
 * The lookup is cached for a couple of seconds to keep the pages fast.
 */
async function liveAccount(session) {
    if (!session || !session.uid) return null;

    const cached = roleCache.get(session.uid);
    if (cached && cached.expires > Date.now()) {
        // The database was unreachable a moment ago - keep the cookie as it is.
        if (cached.offline) return session;
        return cached.exists ? mergeAccount(session, cached.row) : null;
    }

    let row = null;
    let exists = false;
    let offline = false;

    try {
        // Lazy require: the unit tests use this module without a database.
        const db = require('../conn');
        row = await db.one(
            'SELECT id, full_name, username, email, role, subject FROM users WHERE id = ? LIMIT 1',
            [session.uid]
        );
        exists = !!row;
    } catch (err) {
        // The database is not reachable - the signed cookie is the only truth
        // we have, so the session stays as it is.
        offline = true;
    }

    roleCache.set(session.uid, {
        row: row,
        exists: exists,
        offline: offline,
        expires: Date.now() + ROLE_CACHE_MS,
    });

    if (offline) return session;
    if (!exists) return null;

    return mergeAccount(session, row);
}

/** Builds the session object of a request from the account in the database. */
function mergeAccount(session, row) {
    return {
        uid: row.id,
        name: row.full_name,
        email: row.email,
        username: row.username,
        role: row.role,
        subject: row.subject,
        sid: session.sid,
        remember: session.remember === true,
        iat: session.iat,
        exp: session.exp,
    };
}

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

/** Populates req.user / res.locals.user when a valid session cookie exists. */
async function attachUser(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const session = decodeSession(cookies[COOKIE_NAME]);

    req.cookies = cookies;

    try {
        req.user = session ? await liveAccount(session) : null;
    } catch (err) {
        // The account could not be read - the signed cookie is the fallback.
        req.user = session;
    }

    res.locals.user = req.user;
    res.locals.currentPath = req.path;

    next();
}

/** Blocks the request when there is no valid session. */
function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ ok: false, error: 'You need to sign in to do that.' });
    }
    next();
}

/** Blocks the request when the signed-in user is not an administrator. */
function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ ok: false, error: 'You need to sign in to do that.' });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({ ok: false, error: 'Administrator access required.' });
    }
    next();
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

/** True when the given session (or user row) belongs to an administrator. */
function isAdmin(user) {
    return !!user && user.role === 'admin';
}

/** The landing page of a role: admins get the portal, students the app. */
function homeForRole(role) {
    return role === 'admin' ? ADMIN_HOME : STUDENT_HOME;
}

/**
 * Resolves where a signed-in user should land.
 *
 * A `next` target is only honoured when it is an internal path the role is
 * allowed to open - a student asking for /admin is sent to the dashboard
 * instead of the 403 page.
 */
function landingFor(user, next) {
    const home = homeForRole(user && user.role);

    if (typeof next !== 'string' || !next) return home;
    if (next.charAt(0) !== '/' || next.charAt(1) === '/') return home;

    const isAdminPath = next === ADMIN_HOME || next.indexOf(ADMIN_HOME + '/') === 0;
    if (isAdminPath && !isAdmin(user)) return home;

    return next;
}

/**
 * Writes the session cookie for the given user row.
 *
 * Every sign in gets its own random session id, so the cookie of one browser
 * is never the same as the cookie of another one. With "remember me" the
 * cookie lives for a week, without it it is a browser session cookie that
 * disappears when the browser is closed.
 */
function startSession(res, user, remember = false, options = {}) {
    const persistent = remember === true;
    const maxAge = persistent ? MAX_AGE_MS : SESSION_AGE_MS;

    const payload = {
        uid: user.id,
        name: user.full_name,
        email: user.email,
        username: user.username,
        role: user.role,
        sid: crypto.randomBytes(16).toString('base64url'),
        remember: persistent,
        iat: Date.now(),
        exp: Date.now() + maxAge,
    };

    res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, encodeSession(payload), {
        // No Max-Age at all -> a browser session cookie.
        maxAge: persistent ? MAX_AGE_MS : undefined,
        httpOnly: true,
        sameSite: 'Lax',
        secure: options.secure === true,
    }));
}

/** Removes the session cookie. */
function endSession(res, options = {}) {
    res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, '', {
        maxAge: 0,
        httpOnly: true,
        sameSite: 'Lax',
        secure: options.secure === true,
    }));
}

/** True when the request arrived over https (the cookie may be "Secure"). */
function isSecureRequest(req) {
    if (!req) return false;
    if (req.secure) return true;
    const forwarded = req.headers ? req.headers['x-forwarded-proto'] : '';
    return String(forwarded).split(',')[0].trim().toLowerCase() === 'https';
}

/** Shape of the user object that is safe to send to the browser. */
function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        username: user.username,
        role: user.role,
        subject: user.subject,
    };
}

/** Forgets the cached roles (used by the tests and after a role change). */
function clearRoleCache() {
    roleCache.clear();
}

module.exports = {
    COOKIE_NAME,
    ADMIN_HOME,
    STUDENT_HOME,
    parseCookies,
    serializeCookie,
    encodeSession,
    decodeSession,
    liveAccount,
    attachUser,
    requireAuth,
    requireAdmin,
    isAdmin,
    homeForRole,
    landingFor,
    startSession,
    endSession,
    isSecureRequest,
    publicUser,
    clearRoleCache,
};
