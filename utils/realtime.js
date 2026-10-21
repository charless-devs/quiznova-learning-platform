'use strict';

/**
 * QuizNova - realtime events.
 *
 * A tiny event bus on top of Server-Sent Events: no extra dependency, it
 * uses the same signed session cookie as the rest of the app and the
 * browser reconnects on its own.
 *
 * A subscriber tells the server what it wants to hear about:
 *
 *     new EventSource('/api/events?events=message:new,message:reply')
 */

const subscribers = new Map();

let nextId = 1;

/** Parses the ?events= list of a subscriber. */
function eventList(query) {
    const raw = String((query && query.events) || '');

    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

/** Opens an event stream for a signed-in user. */
function subscribe(req, res, user) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Tell nginx not to buffer the stream.
        'X-Accel-Buffering': 'no',
    });

    const id = nextId;
    nextId += 1;

    subscribers.set(id, {
        id: id,
        res: res,
        user: user,
        events: new Set(eventList(req.query)),
    });

    // Retry after 3 seconds if the connection drops.
    res.write('retry: 3000\n\n');
    res.write('event: connected\ndata: ' + JSON.stringify({ id: id }) + '\n\n');

    // A heartbeat keeps proxies from closing the stream.
    const heartbeat = setInterval(function () {
        try {
            res.write(': ping\n\n');
        } catch (err) {
            clearInterval(heartbeat);
        }
    }, 25000);

    const close = function () {
        clearInterval(heartbeat);
        subscribers.delete(id);
        publishPresence();
    };

    req.on('close', close);
    res.on('close', close);

    publishPresence();
}

/** Sends an event to every subscriber that asked for it. */
function publish(event, payload, filter) {
    const data = JSON.stringify(payload || {});

    subscribers.forEach(function (subscriber) {
        if (!subscriber.events.has(event)) return;
        if (filter && !filter(subscriber.user)) return;

        try {
            subscriber.res.write('event: ' + event + '\ndata: ' + data + '\n\n');
        } catch (err) {
            subscribers.delete(subscriber.id);
        }
    });
}

/** How many administrators are listening right now. */
function adminCount() {
    let count = 0;

    subscribers.forEach(function (subscriber) {
        if (subscriber.user && subscriber.user.role === 'admin') count += 1;
    });

    return count;
}

/** Tells everyone who is online. */
function publishPresence() {
    publish('presence', { admins: adminCount(), online: subscribers.size });
}

/** The state of the bus - handy for the health check. */
function stats() {
    return {
        subscribers: subscribers.size,
        admins: adminCount(),
    };
}

module.exports = {
    subscribe,
    publish,
    publishPresence,
    adminCount,
    stats,
};
