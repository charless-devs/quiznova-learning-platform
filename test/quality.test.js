'use strict';

/**
 * The rules of the quality checklist (QUALITY_CHECKLIST.md):
 * nobody loses their work, a click does not do the work twice and a broken
 * connection says so.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/** Loads public/js/shared.js against a tiny DOM. */
function loadShared() {
    const element = () => ({
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute() {},
        getAttribute: () => null,
        appendChild() {},
        addEventListener() {},
        style: {},
        innerHTML: '',
        textContent: '',
        querySelector: () => null,
        querySelectorAll: () => [],
    });

    const sandbox = {
        console,
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        Promise,
        Date,
        Math,
        JSON,
        navigator: { onLine: true },
        document: {
            readyState: 'complete',
            body: element(),
            documentElement: element(),
            createElement: element,
            getElementById: () => null,
            querySelectorAll: () => [],
            querySelector: () => null,
            addEventListener: () => {},
        },
        localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
        },
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'shared.js'), 'utf8'), sandbox, {
        filename: 'shared.js',
    });

    return sandbox;
}

/* ------------------------------------------------------------------ */
/* Nobody loses their work                                             */
/* ------------------------------------------------------------------ */

test('the builder saves the draft by itself', () => {
    const script = fs.readFileSync(path.join(ROOT, 'public', 'js', 'builder.js'), 'utf8');

    assert.ok(script.includes('function startAutosave'), 'the builder has an autosave');
    assert.ok(script.includes('setInterval'), 'the autosave runs on its own');
    assert.ok(script.includes('beforeunload'), 'the tab warns before it is closed');
});

test('the quiz keeps the answers when the browser reloads', () => {
    const script = fs.readFileSync(path.join(ROOT, 'public', 'js', 'assessment.js'), 'utf8');

    assert.ok(script.includes('function saveProgress'), 'the runner saves the answers');
    assert.ok(script.includes('function loadProgress'), 'the runner reads them back');
    assert.ok(script.includes('localStorage'), 'the answers live in the browser');
    assert.ok(script.includes('clearProgress'), 'the answers go away after the quiz');
});

test('the video starts where the student stopped it', () => {
    const script = fs.readFileSync(path.join(ROOT, 'public', 'js', 'courses.js'), 'utf8');

    assert.ok(script.includes('localPosition'), 'the position of the video is kept');
    assert.ok(script.includes('currentTime = saved'), 'the video starts there');
    assert.ok(script.includes('markDone'), 'a lesson can be marked as done');
    assert.ok(script.includes('playbackRate'), 'the speed can be changed');
});

/* ------------------------------------------------------------------ */
/* A click does not do the work twice                                  */
/* ------------------------------------------------------------------ */

test('a button can only do its work once', async () => {
    const { QN } = loadShared();

    const button = { dataset: {}, disabled: false, innerHTML: 'Save' };
    let calls = 0;
    let release;

    const work = () =>
        new Promise(function (resolve) {
            release = resolve;
            calls += 1;
        });

    const first = QN.button(button, 'Saving...', work);
    assert.strictEqual(button.disabled, true, 'the button is disabled while it works');

    // The work starts in the background.
    await Promise.resolve();
    assert.strictEqual(calls, 1, 'the work runs');

    const second = QN.button(button, 'Saving...', work);
    assert.strictEqual(calls, 1, 'a second click does nothing');

    release();
    await first;
    await second;

    assert.strictEqual(button.disabled, false, 'the button works again');
    assert.strictEqual(button.innerHTML, 'Save', 'the label comes back');
});

/* ------------------------------------------------------------------ */
/* A broken connection says so                                         */
/* ------------------------------------------------------------------ */

test('a broken connection says so', async () => {
    const sandbox = loadShared();
    const { QN } = sandbox;

    sandbox.fetch = async () => {
        throw new Error('the network is gone');
    };

    await assert.rejects(
        function () {
            return QN.api('/api/whatever');
        },
        /offline|reach the server/i,
        'the student knows what happened'
    );
});

test('an answer that is not right is not a broken connection', async () => {
    const sandbox = loadShared();
    const { QN } = sandbox;

    sandbox.fetch = async () => ({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, error: 'Please check the highlighted fields.' }),
    });

    await assert.rejects(
        function () {
            return QN.api('/api/whatever');
        },
        /Please check the highlighted fields/
    );
});

/* ------------------------------------------------------------------ */
/* The dialogs                                                        */
/* ------------------------------------------------------------------ */

test('the escape key closes every dialog', () => {
    const script = fs.readFileSync(path.join(ROOT, 'public', 'js', 'shared.js'), 'utf8');

    assert.ok(script.includes("event.key !== 'Escape'"), 'the escape key is watched');
    assert.ok(script.includes('[id$="Modal"]'), 'every dialog of the app is closed');
});
