'use strict';

/**
 * Homepage section navigation.
 *
 * The top menu must not stay stuck on "Home": the pill follows the scroll
 * position and jumps to the link you hover, and clicking a link scrolls to
 * its section.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SECTIONS = ['home', 'quizzes', 'subjects', 'about'];

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

function createElement(props) {
    const el = Object.assign(
        {
            attributes: {},
            style: {},
            listeners: {},
            rect: { top: 0 },
            offsetLeft: 0,
            offsetTop: 0,
            offsetWidth: 100,
            offsetHeight: 36,
            scrolled: null,
        },
        props
    );

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
    el.getBoundingClientRect = () => el.rect;
    el.scrollIntoView = (options) => {
        el.scrolled = options;
    };

    return el;
}

/** Builds the homepage DOM: a nav with a pill and four section links. */
function buildDom() {
    const links = SECTIONS.map((id, index) =>
        createElement({
            attributes: { 'data-nav-link': id, href: '#' + id },
            offsetLeft: index * 100,
            offsetWidth: 100,
            offsetHeight: 36,
        })
    );

    const indicator = createElement({ attributes: { 'data-nav-indicator': '' } });

    const nav = createElement({ attributes: { 'data-section-nav': '' } });
    nav.children = [indicator, ...links];
    nav.querySelector = (selector) => {
        if (selector === '[data-nav-indicator]') return indicator;
        const match = selector.match(/^\[data-nav-link="(.+)"\]$/);
        if (match) return links.find((link) => link.getAttribute('data-nav-link') === match[1]);
        return null;
    };

    const sectionElements = SECTIONS.map((id, index) =>
        createElement({ attributes: { id: id }, rect: { top: index * 900 } })
    );

    // The theme toggle button (the shared script drives it).
    const icon = createElement({ attributes: { 'data-lucide': 'sun' } });
    const toggle = createElement({ attributes: { id: 'themeToggle' } });
    toggle.querySelector = (selector) => (selector === '[data-lucide]' ? icon : null);

    const body = createElement({ attributes: { id: 'body' } });
    const html = createElement({ attributes: { id: 'html' } });

    const document = {
        body: body,
        documentElement: html,
        getElementById: (id) => {
            if (id === 'themeToggle') return toggle;
            return sectionElements.find((el) => el.getAttribute('id') === id) || null;
        },
        querySelectorAll: (selector) => {
            if (selector === '[data-section-nav]') return [nav];
            if (selector === '[data-nav-link]') return links;
            return [];
        },
        querySelector: () => null,
    };

    return { document, nav, indicator, links, sectionElements, body, html, toggle, icon };
}

/** Loads public/js/homepage.js against the stub DOM. */
function loadHomepage(dom, storedTheme) {
    const store = {};

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        Promise,
        scrollY: 0,
        innerHeight: 800,
        history: { replaceState: () => {} },
        localStorage: {
            getItem: (key) => (key in store ? store[key] : null),
            setItem: (key, value) => {
                store[key] = String(value);
            },
        },
    };

    if (storedTheme) store['qn-theme'] = storedTheme;

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.document = dom.document;
    sandbox.addEventListener = (type, handler) => {
        sandbox.listeners[type] = sandbox.listeners[type] || [];
        sandbox.listeners[type].push(handler);
    };
    sandbox.listeners = {};
    sandbox.dispatch = (type) => (sandbox.listeners[type] || []).forEach((handler) => handler({}));

    sandbox.QN = {
        $: (selector) => dom.document.querySelector(selector),
        $$: (selector) => dom.document.querySelectorAll(selector),
        on: () => {},
        setText: () => {},
        escapeHtml: (value) => String(value === null || value === undefined ? '' : value),
        icons: () => {},
        toast: () => {},
        onReady: (fn) => fn(),
        formatTime: (seconds) => String(seconds),
    };

    const source = fs.readFileSync(path.join(ROOT, 'public', 'js', 'homepage.js'), 'utf8');
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'homepage.js' });

    sandbox.store = store;
    return sandbox;
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test('the pill sits on the first section when the page loads', () => {
    const dom = buildDom();
    loadHomepage(dom);

    assert.strictEqual(dom.indicator.style.opacity, '1');
    assert.strictEqual(dom.indicator.style.left, '0px');
    assert.strictEqual(dom.indicator.style.width, '100px');
    assert.strictEqual(dom.indicator.style.height, '36px');
    assert.ok(dom.links[0].classList.contains('text-white'), 'Home is highlighted');
    assert.ok(dom.links[1].classList.contains('text-slate-300'), 'the others are not');
});

test('hovering a link moves the pill to it', () => {
    const dom = buildDom();
    loadHomepage(dom);

    dom.links[2].dispatch('mouseenter');
    assert.strictEqual(dom.indicator.style.left, '200px');
    assert.strictEqual(dom.indicator.style.top, '0px');
    assert.ok(dom.links[2].classList.contains('text-white'), 'Subjects is highlighted');

    // Leaving the link puts the pill back on the active section.
    dom.links[2].dispatch('mouseleave');
    assert.strictEqual(dom.indicator.style.left, '0px');
});

test('the active link follows the scroll position', () => {
    const dom = buildDom();
    const sandbox = loadHomepage(dom);

    // Scrolled down to the quizzes section.
    sandbox.scrollY = 1000;
    dom.sectionElements[0].rect.top = -1000;
    dom.sectionElements[1].rect.top = -100;
    dom.sectionElements[2].rect.top = 800;
    sandbox.dispatch('scroll');

    assert.strictEqual(dom.indicator.style.left, '100px', 'the pill is on Quizzes');
    assert.ok(dom.links[1].classList.contains('text-white'), 'Quizzes is highlighted');

    // Scrolled to the very bottom -> the last section wins.
    sandbox.scrollY = 2400;
    dom.sectionElements[3].rect.top = 0;
    sandbox.dispatch('scroll');

    assert.strictEqual(dom.indicator.style.left, '300px', 'the pill is on About');
    assert.ok(dom.links[3].classList.contains('text-white'), 'About is highlighted');
});

test('clicking a link scrolls to its section', () => {
    const dom = buildDom();
    loadHomepage(dom);

    dom.links[1].dispatch('click', { preventDefault: () => {} });

    assert.ok(dom.sectionElements[1].scrolled, 'the quizzes section was scrolled to');
    assert.strictEqual(dom.sectionElements[1].scrolled.behavior, 'smooth');
    assert.strictEqual(dom.sectionElements[1].scrolled.block, 'start');
    assert.strictEqual(dom.indicator.style.left, '100px', 'the pill moved to Quizzes');
});

test('the template ships the four section links and a pill', () => {
    const html = fs.readFileSync(path.join(ROOT, 'views', 'homepage.ejs'), 'utf8');

    ['home', 'quizzes', 'subjects', 'about'].forEach((id) => {
        assert.ok(html.includes('data-nav-link="' + id + '"'), 'the ' + id + ' link exists');
        assert.ok(html.includes('id="' + id + '"'), 'the ' + id + ' section exists');
    });

    assert.ok(html.includes('data-nav-indicator'), 'the sliding pill exists');
    assert.ok(html.includes('data-section-nav'), 'the nav is marked for the script');
});

test('the homepage stylesheet offsets the anchor jumps under the header', () => {
    const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'homepage.css'), 'utf8');

    assert.ok(css.includes('scroll-padding-top'), 'the sticky header does not cover a section title');
    assert.ok(css.includes('scroll-behavior: smooth'), 'the jumps are smooth');
});
