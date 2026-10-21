'use strict';

/**
 * QuizNova - the uploaded videos.
 *
 * The admin can upload a video file (it is stored in public/uploads/videos
 * and served by express.static) or set a link to a video that lives
 * somewhere else (YouTube, Vimeo, a direct mp4 ...).
 *
 * On Vercel the file system is read only, so the files go to the Vercel Blob
 * store when BLOB_READ_WRITE_TOKEN is set.
 */

const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'videos');

/** The video types the platform accepts. */
const EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'];

/** The biggest file the server takes. */
const MAX_SIZE = 200 * 1024 * 1024;

/** The Blob store of Vercel. */
const BLOB_API = 'https://blob.vercel-storage.com/v1';

/** True when the files go to the Blob store and not to the disk. */
function usesBlob() {
    return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** True when the disk of the server can be written. */
function canWriteToDisk() {
    if (process.env.VERCEL) return false;

    try {
        ensureFolder();
        return true;
    } catch (err) {
        return false;
    }
}

/** Makes sure the upload folder exists. */
function ensureFolder() {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    return UPLOAD_DIR;
}

/** The extension of a file name. */
function extensionOf(name) {
    const extension = path.extname(String(name || '')).toLowerCase();
    return EXTENSIONS.indexOf(extension) > -1 ? extension : '';
}

/**
 * A file name that is safe on every system: no spaces, no strange
 * characters and never a path that points somewhere else.
 */
function safeName(name) {
    const base = path.basename(String(name || 'video'));
    const extension = extensionOf(base);
    const stem = path
        .basename(base, path.extname(base))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);

    return (stem || 'video') + extension;
}

/** Uploads a file to the Blob store of Vercel. */
async function saveToBlob(name, buffer, contentType) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const target = 'videos/' + name;

    const response = await fetch(BLOB_API + '/upload?path=' + encodeURIComponent(target), {
        method: 'POST',
        headers: {
            authorization: 'Bearer ' + token,
            'content-type': contentType || 'application/octet-stream',
            'x-content-disposition': 'inline',
            'x-add-random-suffix': '1',
        },
        body: buffer,
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error('The Blob store refused the file: ' + (detail || response.status));
    }

    const payload = await response.json().catch(function () {
        return {};
    });

    const url = payload.url || (payload.blob && payload.blob.url);

    if (!url) throw new Error('The Blob store did not return an address for the file.');

    return url;
}

/** Removes a file from the Blob store of Vercel. */
async function removeFromBlob(url) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token || !url || url.indexOf('blob.vercel-storage.com') === -1) return false;

    try {
        await fetch(BLOB_API + '/delete?url=' + encodeURIComponent(url), {
            method: 'POST',
            headers: { authorization: 'Bearer ' + token },
        });
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Writes an uploaded video and returns what the database needs.
 *
 * @returns {Promise<{file_path: string, file_name: string, file_size: number}>}
 */
async function save(courseId, fileName, buffer, contentType) {
    if (!buffer || !buffer.length) {
        throw new Error('The file is empty.');
    }

    if (buffer.length > MAX_SIZE) {
        throw new Error('The video is too big (the limit is 200 MB).');
    }

    const name = safeName(fileName);
    if (!extensionOf(name)) {
        throw new Error('Only ' + EXTENSIONS.join(', ') + ' videos are accepted.');
    }

    if (usesBlob()) {
        const url = await saveToBlob('course-' + (courseId || 0) + '-' + Date.now() + '-' + name, buffer, contentType);

        return {
            file_path: url,
            file_name: fileName || name,
            file_size: buffer.length,
        };
    }

    if (!canWriteToDisk()) {
        throw new Error(
            'The server cannot store files (the disk is read only). Set BLOB_READ_WRITE_TOKEN for the Blob store of Vercel, or use a link.'
        );
    }

    const stored = 'course-' + (courseId || 0) + '-' + Date.now() + '-' + name;
    fs.writeFileSync(path.join(UPLOAD_DIR, stored), buffer);

    return {
        file_path: '/uploads/videos/' + stored,
        file_name: fileName || name,
        file_size: buffer.length,
    };
}

/** Removes an uploaded file (the database row is removed by the route). */
async function remove(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;

    // A file of the Blob store.
    if (filePath.indexOf('blob.vercel-storage.com') > -1) {
        return removeFromBlob(filePath);
    }

    if (filePath.indexOf('/uploads/videos/') !== 0) return false;

    const name = path.basename(filePath);
    const target = path.join(UPLOAD_DIR, name);

    // Never touch a file outside of the upload folder.
    if (path.dirname(target) !== path.resolve(UPLOAD_DIR)) return false;

    try {
        fs.unlinkSync(target);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * The kind of a link: YouTube, Vimeo or a plain link.
 */
function providerOf(url) {
    const clean = String(url || '').trim().toLowerCase();

    if (clean.indexOf('youtube.com') > -1 || clean.indexOf('youtu.be') > -1) return 'YOUTUBE';
    if (clean.indexOf('vimeo.com') > -1) return 'VIMEO';
    if (/\.(mp4|webm|ogg|ogv|mov|m4v)(\?|$)/.test(clean)) return 'FILE';

    return 'LINK';
}

/**
 * The address the player uses.
 *
 * A YouTube or a Vimeo link becomes the address of the player, every other
 * link stays as it is.
 */
function embedUrl(provider, url) {
    const clean = String(url || '').trim();

    if (provider === 'YOUTUBE') {
        const match = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(clean);
        return match ? 'https://www.youtube.com/embed/' + match[1] : clean;
    }

    if (provider === 'VIMEO') {
        const match = /vimeo\.com\/(?:video\/)?(\d+)/.exec(clean);
        return match ? 'https://player.vimeo.com/video/' + match[1] : clean;
    }

    return clean;
}

module.exports = {
    UPLOAD_DIR,
    EXTENSIONS,
    MAX_SIZE,
    ensureFolder,
    extensionOf,
    safeName,
    save,
    remove,
    providerOf,
    embedUrl,
    usesBlob,
    canWriteToDisk,
};
