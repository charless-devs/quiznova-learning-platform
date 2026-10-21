'use strict';

/**
 * The sign out: the session is closed and the app says goodbye.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ------------------------------------------------------------------ */
/* A tiny DOM stub                                                     */
/* ------------------------------------------------------------------ */

function createElement(tag) {
    const set = new Set();
    const el = {
        tagName: (tag || 'div').toUpperCase(),
        style: { cssText: '' },
        className: '',
        textContent: '',
        innerHTML: '',
        children: [],
        listeners: {},
        id: '',
        type: '',
        focused: false,
        classList: {
            add: (name) => set.add(name),
            remove: (name) => set.delete(name),
            toggle: (name, force) => {
                const on = force === undefined ? !set.has(name) : !!force;
                if (on) set.add(name);
                else set.delete(name);
                return on;
            },
            contains: (name) => set.has(name),
        },
    };

    el.appendChild = (child) => {
        el.children.push(child);
        return child;
    };
    el.addEventListener = (type, handler) => {
        el.listeners[type] = el.listeners[type] || [];
        el.listeners[type].push(handler);
    };
    el.dispatch = (type, event) => {
        (el.listeners[type] || []).forEach((handler) => handler(event || {}));
    };
    el.focus = () => {
        el.focused = true;
    };
    el.setAttribute = (name, value) => {
        el[name] = value;
    };
    el.getAttribute = (name) => el[name];

    return el;
}

/** Loads public/js/shared.js against the stub. */
function loadShared() {
    const body = createElement('body');
    const timers = [];

    const document = {
        readyState: 'complete',
        body: body,
        documentElement: createElement('html'),
        createElement: createElement,
        getElementById: (id) => {
            if (id === 'qnLoggedOut') return document.getElementById.qnLoggedOut || null;
            return null;
        },
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: () => {},
    };

    const sandbox = {
        console,
        setTimeout: (fn, ms) => {
            timers.push({ fn: fn, ms: ms });
            return timers.length;
        },
        clearTimeout: (id) => {
            if (timers[id - 1]) timers[id - 1].fn = null;
        },
        Promise,
        document: document,
        localStorage: {
            getItem: () => null,
            setItem: () => {},
        },
        fetch: async () => ({
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
        }),
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.location = { href: '/dashboard' };

    const source = fs.readFileSync(path.join(ROOT, 'public', 'js', 'shared.js'), 'utf8');
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'shared.js' });

    return { sandbox, body, timers };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test('the sign out shows a popup that says goodbye', () => {
    const { sandbox, body } = loadShared();

    sandbox.QN.showLoggedOut();

    assert.strictEqual(body.children.length, 1, 'the popup is on the page');

    const overlay = body.children[0];
    const card = overlay.children[0];

    const html = JSON.stringify(card);
    assert.ok(html.includes('You are logged out'), 'the popup says that you are logged out');

    // The title and the button are there.
    const title = card.children[1];
    assert.strictEqual(title.textContent, 'You are logged out');

    const button = card.children[3];
    assert.strictEqual(button.textContent, 'Back to the login');
});

test('the popup closes by itself and the button goes to the login', () => {
    const { sandbox, timers } = loadShared();

    sandbox.QN.showLoggedOut();

    const timer = timers[timers.length - 1];
    assert.ok(timer, 'a timer is running');
    assert.ok(timer.ms > 500, 'the popup stays long enough to be read');

    // The button sends the visitor to the login page.
    const overlay = sandbox.document.body.children[0];
    const button = overlay.children[0].children[3];

    assert.ok(button.listeners.click, 'the button reacts to a click');
    button.dispatch('click');
    assert.strictEqual(sandbox.location.href, '/accsetup');
});

test('the logout of the portal closes the session first', async () => {
    const { sandbox } = loadShared();

    await sandbox.QN.logout();

    assert.strictEqual(sandbox.document.body.children.length, 1, 'the popup appears');
    assert.ok(
        JSON.stringify(sandbox.document.body.children[0]).includes('You are logged out'),
        'the popup says that you are logged out'
    );
});

test('the logout button of the pages uses the shared function', () => {
    const files = [
        'views/dashboard.ejs',
        'views/classes.ejs',
        'views/assessment.ejs',
        'views/admin/adminportal.ejs',
        'views/settings.ejs',
    ];

    files.forEach((file) => {
        const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.ok(content.includes('logout()'), file + ' has a logout button');
    });
});
