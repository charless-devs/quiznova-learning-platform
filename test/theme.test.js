'use strict';

/**
 * The theme toggle.
 *
 * Light mode has to work on every page of the site, so the theme lives on
 * <html> and the page colours come from CSS variables.
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

function makeClassList() {
    const set = new Set();
    return {
        add: (name) => set.add(name),
        remove: (name) => set.delete(name),
        toggle: (name, force) => {
            const on = force === undefined ? !set.has(name) : !!force;
            if (on) set.add(name);
            else set.delete(name);
            return on;
        },
        contains: (name) => set.has(name),
        _set: set,
    };
}

function createElement(withIcon = true) {
    const el = {
        attributes: {},
        style: {},
        listeners: {},
        title: '',
    };

    el.classList = makeClassList();
    el.addEventListener = (type, handler) => {
        el.listeners[type] = el.listeners[type] || [];
        el.listeners[type].push(handler);
    };
    el.dispatch = (type, event) => {
        (el.listeners[type] || []).forEach((handler) => handler(event || {}));
    };
    el.getAttribute = (name) => (name in el.attributes ? el.attributes[name] : null);
    el.setAttribute = (name, value) => {
        el.attributes[name] = String(value);
    };
    el.querySelector = (selector) => (selector === '[data-lucide]' ? el.icon : null);
    if (withIcon) el.icon = createElement(false);

    return el;
}

/** Loads public/js/shared.js against a stub DOM with N toggle buttons. */
function loadShared(buttonCount = 1, storedTheme = null) {
    const store = {};
    if (storedTheme) store['qn-theme'] = storedTheme;

    const buttons = [];
    for (let i = 0; i < buttonCount; i += 1) buttons.push(createElement());

    const root = createElement();
    const body = createElement();

    const document = {
        readyState: 'complete',
        body: body,
        documentElement: root,
        addEventListener: () => {},
        getElementById: () => null,
        querySelectorAll: (selector) => (selector === '[data-theme-toggle]' ? buttons : []),
        querySelector: () => null,
    };

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        Promise,
        document: document,
        localStorage: {
            getItem: (key) => (key in store ? store[key] : null),
            setItem: (key, value) => {
                store[key] = String(value);
            },
        },
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const source = fs.readFileSync(path.join(ROOT, 'public', 'js', 'shared.js'), 'utf8');
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'shared.js' });

    return { sandbox, root, body, buttons, store };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test('the toggle switches the whole site between dark and light', () => {
    const dom = loadShared();

    assert.ok(dom.root.classList.contains('dark'), 'dark by default');
    assert.ok(!dom.root.classList.contains('light'));

    dom.buttons[0].dispatch('click');

    assert.ok(dom.root.classList.contains('light'), 'light mode is on');
    assert.ok(!dom.root.classList.contains('dark'), 'the dark class is removed');
    assert.ok(dom.body.classList.contains('theme-light'), 'the body knows about it too');
    assert.strictEqual(dom.buttons[0].icon.getAttribute('data-lucide'), 'moon', 'the icon follows');
    assert.strictEqual(dom.buttons[0].getAttribute('title'), 'Switch to dark mode');
    assert.strictEqual(dom.buttons[0].getAttribute('aria-pressed'), 'true');

    dom.buttons[0].dispatch('click');

    assert.ok(dom.root.classList.contains('dark'), 'back to dark');
    assert.ok(!dom.root.classList.contains('light'));
    assert.strictEqual(dom.buttons[0].icon.getAttribute('data-lucide'), 'sun');
});

test('every toggle button on a page follows the theme', () => {
    const dom = loadShared(2);

    dom.buttons[0].dispatch('click');

    dom.buttons.forEach((button) => {
        assert.strictEqual(button.icon.getAttribute('data-lucide'), 'moon');
        assert.strictEqual(button.getAttribute('aria-pressed'), 'true');
    });
});

test('the chosen theme is remembered for the next visit', () => {
    const dom = loadShared();

    dom.buttons[0].dispatch('click');
    assert.strictEqual(dom.store['qn-theme'], 'light');

    // A fresh page load picks the theme back up.
    const reloaded = loadShared(1, 'light');
    assert.ok(reloaded.root.classList.contains('light'), 'light mode is restored');
    assert.strictEqual(reloaded.buttons[0].icon.getAttribute('data-lucide'), 'moon');
});

test('the theme is applied before the first paint', () => {
    const init = fs.readFileSync(path.join(ROOT, 'public', 'js', 'theme-init.js'), 'utf8');
    const head = fs.readFileSync(path.join(ROOT, 'views', 'partials', 'head.ejs'), 'utf8');

    assert.ok(init.includes("localStorage.getItem"), 'the stored theme is read');
    assert.ok(init.includes("classList.toggle('light'"), 'the theme is set on <html>');
    assert.ok(head.includes('/js/theme-init.js'), 'the page loads it in the head');
});

test('every page has a theme toggle', () => {
    const pages = [
        'homepage.ejs',
        'register_login.ejs',
        'dashboard.ejs',
        'classes.ejs',
        'assessment.ejs',
        'quiz.ejs',
        'profile.ejs',
        'materials.ejs',
        'analytics.ejs',
        'messages.ejs',
        'community.ejs',
        path.join('admin', 'adminportal.ejs'),
    ];

    pages.forEach((file) => {
        const content = fs.readFileSync(path.join(ROOT, 'views', file), 'utf8');
        assert.ok(content.includes('data-theme-toggle'), file + ' has a theme toggle');
    });
});

test('every page colour comes from a theme variable', () => {
    const configs = fs.readdirSync(path.join(ROOT, 'public', 'js', 'config'));

    configs.forEach((file) => {
        const content = fs.readFileSync(path.join(ROOT, 'public', 'js', 'config', file), 'utf8');

        // No surface colour may stay a literal - it would not follow the theme.
        const literal = content.match(/(darkBg|cardBg|appBg|navBg|navyBg|panelBg|inputBg|hoverBg|codeBg|borderBg|mutedBorder):\s*'#[0-9a-f]{3,8}'/i);
        assert.strictEqual(literal, null, file + ' must use the theme variables');
    });

    const dashboard = fs.readFileSync(
        path.join(ROOT, 'public', 'js', 'config', 'dashboard.tailwind.js'),
        'utf8'
    );
    assert.ok(dashboard.includes('rgb(var(--qn-card) / <alpha-value>)'));
    assert.ok(dashboard.includes('rgb(var(--qn-border) / <alpha-value>)'));
    assert.ok(dashboard.includes('rgb(var(--qn-input) / <alpha-value>)'));
});

test('the shared stylesheet carries the light theme', () => {
    const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'base.css'), 'utf8');

    assert.ok(css.includes('html.light'), 'the light theme is scoped to <html>');
    assert.ok(css.includes('--qn-page: 241 245 249'), 'light mode has a light page background');
    assert.ok(css.includes('--qn-card: 255 255 255'), 'light mode has white cards');

    // The hard coded slate colours need their readable counterparts.
    [
        'text-white',
        'text-slate-300',
        'text-slate-400',
        'bg-slate-900\\/60',
        'hover\\:bg-slate-800',
        'text-brand-400',
    ].forEach((selector) => {
        assert.ok(css.includes(selector), 'light mode restyles ' + selector);
    });
});
