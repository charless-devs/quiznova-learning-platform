'use strict';

/**
 * QuizNova - application entry point.
 *
 *   npm start        -> node app.js
 *   npm run dev      -> nodemon app.js
 *   npm run db:setup -> create + seed the MySQL database
 */

const path = require('path');
const express = require('express');

const db = require('./conn');
const { port: PORT } = require('./config');
const { attachUser } = require('./middleware/auth');
const pageRoutes = require('./routes/pages');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();

/* ------------------------------------------------------------------ */
/* App configuration                                                   */
/* ------------------------------------------------------------------ */

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

// The pages carry the name, the email and the role of the signed-in account,
// so they must never be stored by a browser or by a proxy in between.
app.set('etag', false);

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

app.use(
    express.static(path.join(__dirname, 'public'), {
        maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/**
 * Keeps the answers of two browsers apart.
 *
 * Without these headers a shared cache (nginx, Cloudflare, XAMPP, a hosting
 * proxy) is free to keep the admin view of one browser and to hand it to
 * another one - the student dashboard would then show the admin portal
 * without anybody signing in.
 */
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Vary', 'Cookie');
    next();
});

app.use(attachUser);

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/', pageRoutes);

/* ------------------------------------------------------------------ */
/* 404 + error handling                                                */
/* ------------------------------------------------------------------ */

app.use((req, res) => {
    if (req.accepts('html')) {
        // A page that was added after the server started: the routes live in
        // the memory of the server, so it has to be restarted.
        const hint = req.path.startsWith('/admin')
            ? '<p>The server is still running an older version. Restart it with <code>npm start</code> - or work with <code>npm run dev</code>, that restarts it on every change.</p>'
            : '';

        return res.status(404).send(
            `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
             <title>404 - QuizNova</title>
             <style>body{background:#0b0f19;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;
             align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
             .box{max-width:520px;padding:40px}
             h1{font-size:64px;margin:0;color:#8b5cf6}p{color:#94a3b8}
             code{background:#1a2035;padding:2px 6px;border-radius:6px;color:#a78bfa}
             a{color:#a78bfa;text-decoration:none}</style></head>
             <body><div class="box"><h1>404</h1>
             <p>We could not find <code>${req.path.replace(/[<>&"]/g, '')}</code>.</p>
             ${hint}
             <p><a href="/">Back to the homepage</a></p></div></body></html>`
        );
    }
    return res.status(404).json({ ok: false, error: 'Not found.' });
});

app.use((err, req, res, next) => {
    console.error('[error]', err.stack || err.message);

    if (res.headersSent) return next(err);

    // A file that is too big for the upload.
    if (err.type === 'entity.too.large' || err.status === 413) {
        return res.status(413).json({
            ok: false,
            error: 'The file is too big - the limit is 200 MB.',
        });
    }

    const status = err.status || 500;
    if (req.accepts('html')) {
        return res.status(status).send(
            `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Error - QuizNova</title>
             <style>body{background:#0b0f19;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;
             align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
             h1{font-size:48px;margin:0;color:#f43f5e}p{color:#94a3b8}</style></head>
             <body><div><h1>Something broke</h1><p>${String(err.message).replace(/[<>&"]/g, '')}</p>
             <p><a style="color:#a78bfa" href="/">Back to the homepage</a></p></div></body></html>`
        );
    }
    return res.status(status).json({ ok: false, error: err.message || 'Unexpected server error.' });
});

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n  QuizNova is running at http://localhost:${PORT}\n`);

        db.ping().then((ok) => {
            if (ok) {
                console.log(`  [db] connected to MySQL (${db.getConfig().database})`);
            } else {
                const err = db.getLastError();
                console.warn('  [db] MySQL is not reachable - running in demo mode.');
                console.warn(`       ${err ? err.code || err.message : 'unknown error'}`);
                console.warn('       Start MySQL and run "npm run db:setup" for full functionality.\n');
            }
        });
    });
}

module.exports = app;
