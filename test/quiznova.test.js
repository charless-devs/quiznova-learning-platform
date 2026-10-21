'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Loads a page script in a sandbox and returns its exported globals. */
function loadPageScript(file) {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Promise,
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.document = {
        readyState: 'complete',
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
    };
    sandbox.QN = {
        $: () => null,
        $$: () => [],
        on: () => {},
        setText: () => {},
        escapeHtml: (value) =>
            String(value === null || value === undefined ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;'),
        icons: () => {},
        toast: () => {},
        onReady: () => {},
        formatTime: (seconds) => {
            const mins = Math.floor(Math.max(0, seconds) / 60);
            const secs = Math.max(0, seconds) % 60;
            return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        },
    };

    const source = fs.readFileSync(path.join(ROOT, 'public', 'js', file), 'utf8');
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: file });

    return sandbox;
}

/* ------------------------------------------------------------------ */
/* Syntax highlighter (the original file had a fatal syntax error)     */
/* ------------------------------------------------------------------ */

test('formatSyntax escapes markup and highlights the C keywords', () => {
    const sandbox = loadPageScript('quiz.js');
    const html = sandbox.formatSyntax(
        '#include<stdio.h>\nint main() { if (x) { return printf("%d", 10); } }'
    );

    assert.ok(html.includes('&lt;stdio.h&gt;'), 'angle brackets must be escaped');
    assert.ok(!html.includes('<stdio.h>'), 'raw tags must never reach innerHTML');
    assert.ok(html.includes('syn-type">int<'), 'types are highlighted');
    assert.ok(html.includes('syn-keyword">return<'), 'keywords are highlighted');
    assert.ok(html.includes('syn-keyword">if<'), 'control flow is highlighted');
    assert.ok(html.includes('syn-func">printf<'), 'functions are highlighted');
    assert.ok(html.includes('syn-str">&quot;%d&quot;<'), 'strings are highlighted');
    assert.ok(html.includes('syn-num">10<'), 'numbers are highlighted');
});

test('formatSyntax highlights comments and handles an empty snippet', () => {
    const sandbox = loadPageScript('quiz.js');

    assert.strictEqual(sandbox.formatSyntax(''), '');
    assert.strictEqual(sandbox.formatSyntax(null), '');

    const html = sandbox.formatSyntax('// a comment\nint x;');
    assert.ok(html.includes('syn-comment">// a comment<'));
});

/* ------------------------------------------------------------------ */
/* Password hashing                                                    */
/* ------------------------------------------------------------------ */

test('passwords are salted, hashed and verifiable', async () => {
    const { hashPassword, verifyPassword } = require(path.join(ROOT, 'utils', 'password'));

    const hash = await hashPassword('quiznova123');
    assert.ok(hash.startsWith('scrypt$'), 'hash uses the scrypt format');
    assert.ok(!hash.includes('quiznova123'), 'the plain password is never stored');

    assert.strictEqual(await verifyPassword('quiznova123', hash), true);
    assert.strictEqual(await verifyPassword('wrong', hash), false);
    assert.strictEqual(await verifyPassword('quiznova123', 'garbage'), false);
    assert.strictEqual(await verifyPassword('quiznova123', ''), false);

    const second = await hashPassword('quiznova123');
    assert.notStrictEqual(hash, second, 'each hash uses a fresh salt');
});

/* ------------------------------------------------------------------ */
/* Session cookie                                                      */
/* ------------------------------------------------------------------ */

test('the session cookie is signed and tamper proof', () => {
    const auth = require(path.join(ROOT, 'middleware', 'auth'));

    const token = auth.encodeSession({
        uid: 1,
        name: 'Alex Morgan',
        email: 'alex@example.com',
        username: 'alex',
        role: 'student',
        exp: Date.now() + 60000,
    });

    const decoded = auth.decodeSession(token);
    assert.strictEqual(decoded.uid, 1);
    assert.strictEqual(decoded.name, 'Alex Morgan');

    assert.strictEqual(auth.decodeSession(token + 'x'), null, 'a modified token is rejected');
    assert.strictEqual(auth.decodeSession('garbage'), null);
    assert.strictEqual(auth.decodeSession(''), null);

    const expired = auth.encodeSession({ uid: 1, exp: Date.now() - 1000 });
    assert.strictEqual(auth.decodeSession(expired), null, 'expired sessions are rejected');
});

test('cookies are parsed and serialised safely', () => {
    const auth = require(path.join(ROOT, 'middleware', 'auth'));

    const jar = auth.parseCookies('qn_session=abc; theme=dark; encoded=a%20b');
    assert.strictEqual(jar.qn_session, 'abc');
    assert.strictEqual(jar.theme, 'dark');
    assert.strictEqual(jar.encoded, 'a b');

    assert.deepStrictEqual(auth.parseCookies(''), {});
    assert.deepStrictEqual(auth.parseCookies(undefined), {});

    const header = auth.serializeCookie('qn_session', 'x', { maxAge: 1000 });
    assert.ok(header.includes('qn_session=x'));
    assert.ok(header.includes('HttpOnly'));
    assert.ok(header.includes('SameSite=Lax'));
});

/* ------------------------------------------------------------------ */
/* Question bank                                                       */
/* ------------------------------------------------------------------ */

test('the question bank is complete and consistent', () => {
    const bank = require(path.join(ROOT, 'data', 'questionBank'));

    assert.strictEqual(bank.rapidhunt.length, 24, 'the coding assessment has 24 questions');
    assert.ok(bank.assessmentRunner.length >= 5);

    for (const question of bank.rapidhunt) {
        assert.strictEqual(question.options.length, 4, 'each question has 4 options');
        assert.ok('ABCD'.includes(question.correct), 'the answer key is A-D');
        assert.ok(question.prompt && question.code, 'questions carry a prompt and a snippet');
    }

    for (const item of bank.assessments) {
        assert.ok(item.slug, 'assessments have a slug');
        assert.ok(item.questions.length > 0);
    }

    const slugs = bank.assessments.map((item) => item.slug);
    assert.strictEqual(new Set(slugs).size, slugs.length, 'slugs are unique');
});

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

test('no template contains inline styles or inline scripts', () => {
    const viewsDir = path.join(ROOT, 'views');
    const files = [];

    (function walk(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.ejs')) files.push(full);
        });
    })(viewsDir);

    const pages = files.filter((file) => !file.includes('partials'));
    assert.ok(pages.length >= 7, 'all pages are present');

    pages.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        assert.ok(!/<style[\s>]/.test(content), path.basename(file) + ' has no inline <style>');
        assert.ok(!/<script(?![^>]*\bsrc=)[\s>]/.test(content), path.basename(file) + ' has no inline <script>');
    });
});

test('every page references its own stylesheet and script', () => {
    const head = fs.readFileSync(path.join(ROOT, 'views', 'partials', 'head.ejs'), 'utf8');
    const foot = fs.readFileSync(path.join(ROOT, 'views', 'partials', 'foot.ejs'), 'utf8');

    assert.ok(head.includes('/css/<%= page %>.css'), 'the head partial loads the page stylesheet');
    assert.ok(head.includes('/css/base.css'), 'the head partial loads the base stylesheet');
    assert.ok(head.includes('/js/config/<%= page %>.tailwind.js'), 'the head partial loads the theme');
    assert.ok(foot.includes('/js/<%= page %>.js'), 'the foot partial loads the page script');
    assert.ok(foot.includes('/js/shared.js'), 'the foot partial loads the shared script');

    const pages = {
        'homepage.ejs': 'homepage',
        'register_login.ejs': 'register_login',
        'dashboard.ejs': 'dashboard',
        'classes.ejs': 'classes',
        'assessment.ejs': 'assessment',
        'quiz.ejs': 'quiz',
        'profile.ejs': 'profile',
        'courses.ejs': 'courses',
        'settings.ejs': 'settings',
        'materials.ejs': 'materials',
        'analytics.ejs': 'analytics',
        'messages.ejs': 'messages',
        'community.ejs': 'community',
        [path.join('admin', 'adminportal.ejs')]: 'adminportal',
    };

    Object.keys(pages).forEach((file) => {
        const name = pages[file];
        const content = fs.readFileSync(path.join(ROOT, 'views', file), 'utf8');

        assert.ok(content.includes("page: '" + name + "'"), file + ' passes its page name');
        assert.ok(content.includes("partials/head"), file + ' uses the shared head');
        assert.ok(content.includes("partials/foot"), file + ' uses the shared foot');

        assert.ok(
            fs.existsSync(path.join(ROOT, 'public', 'css', name + '.css')),
            'public/css/' + name + '.css exists'
        );
        assert.ok(
            fs.existsSync(path.join(ROOT, 'public', 'js', name + '.js')),
            'public/js/' + name + '.js exists'
        );
        assert.ok(
            fs.existsSync(path.join(ROOT, 'public', 'js', 'config', name + '.tailwind.js')),
            'public/js/config/' + name + '.tailwind.js exists'
        );
    });
});
