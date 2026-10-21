/* ==========================================================================
   QuizNova - my courses
   The course list, the search and the player of the videos.

   The player behaves like the players of the other learning platforms: the
   video starts where the student stopped it, a lesson can be marked as done
   and the course shows how far the student is.
   ========================================================================== */

(function () {
    'use strict';

    const player = {
        course: null,
        video: null,
        saving: false,
    };

    /* ------------------------------------------------------------------ */
    /* The place where the position is kept                                */
    /* ------------------------------------------------------------------ */

    const STORE = 'qn-video-position';

    function storeKey(videoId) {
        return STORE + ':' + videoId;
    }

    /** The position of a video in this browser. */
    function localPosition(videoId) {
        try {
            const value = Number(window.localStorage.getItem(storeKey(videoId)));
            return isFinite(value) && value > 0 ? value : 0;
        } catch (err) {
            return 0;
        }
    }

    function saveLocalPosition(videoId, seconds) {
        try {
            window.localStorage.setItem(storeKey(videoId), String(Math.max(0, Math.round(seconds || 0))));
        } catch (err) {
            /* the private mode does not allow it */
        }
    }

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    function field(id) {
        return document.getElementById(id);
    }

    function el(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined && text !== null) element.textContent = text;
        return element;
    }

    /** The length of a video in a readable way. */
    function duration(seconds) {
        const total = Number(seconds) || 0;
        if (!total) return '';

        const minutes = Math.floor(total / 60);
        const rest = total % 60;

        return minutes + ':' + String(rest).padStart(2, '0');
    }

    /* ------------------------------------------------------------------ */
    /* Search                                                              */
    /* ------------------------------------------------------------------ */

    function filterCourses() {
        const input = field('courseSearchInput');
        const cards = QN.$$('.course-card');
        if (!input) return;

        const query = input.value.toLowerCase().trim();
        let visible = 0;

        cards.forEach(function (card) {
            // textContent (not innerText) so a hidden card can still match
            // once the search is widened again.
            const match = (card.textContent || '').toLowerCase().includes(query);
            card.classList.toggle('hidden', !match);
            if (match) visible += 1;
        });

        QN.setText('courseCount', String(visible));
    }

    /* ------------------------------------------------------------------ */
    /* The player                                                          */
    /* ------------------------------------------------------------------ */

    /** Opens the player of a course. */
    async function openCoursePlayer(courseId) {
        const modal = field('courseModal');
        if (!modal) return;

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        QN.setText('modalTitle', 'Loading...');
        QN.setText('modalInstructor', '');

        const list = field('playerList');
        if (list) list.innerHTML = '<p class="qn-admin-loading">The lessons are loading...</p>';

        try {
            const data = await QN.api('/api/courses');
            const course = (data.courses || []).find(function (item) {
                return Number(item.id) === Number(courseId);
            });

            if (!course) {
                QN.setText('modalTitle', 'This course is not available');
                if (list) list.innerHTML = '';
                return;
            }

            player.course = course;

            QN.setText('modalTitle', course.title);
            QN.setText(
                'modalInstructor',
                (course.instructor ? course.instructor + ' - ' : '') + course.subject
            );

            renderPlaylist(course);

            const videos = course.videos || [];
            if (videos.length) playVideo(course, videos[0]);
            else {
                const frame = field('playerFrame');
                if (frame) {
                    frame.innerHTML = '<p class="text-xs text-slate-500">This course has no video yet.</p>';
                }
            }
        } catch (err) {
            if (err.offline) {
                QN.retry(err.message, function () {
                    openCoursePlayer(courseId);
                });
                return;
            }

            QN.toast('The course could not be opened: ' + err.message, 'error');
        }
    }

    /** The list of the lessons of the course. */
    function renderPlaylist(course) {
        const list = field('playerList');
        if (!list) return;

        list.innerHTML = '';

        const videos = course.videos || [];

        // How far the student is with this course.
        const done = videos.filter(function (video) {
            return video.progress && Number(video.progress.completed) === 1;
        }).length;

        const summary = el('div', 'p-3 rounded-xl bg-inputBg border border-borderBg space-y-1.5');
        summary.appendChild(
            el('p', 'text-[10px] font-bold uppercase tracking-wider text-slate-400', 'Your progress')
        );
        summary.appendChild(
            el(
                'p',
                'text-xs font-bold text-white',
                done + ' of ' + videos.length + ' lesson' + (videos.length === 1 ? '' : 's') + ' done'
            )
        );

        const bar = el('div', 'h-1.5 w-full bg-cardBg rounded-full overflow-hidden');
        const fill = el('div', 'h-full rounded-full bg-gradient-to-r from-brand-500 to-coral-500');
        fill.style.width = (videos.length ? Math.round((done / videos.length) * 100) : 0) + '%';
        bar.appendChild(fill);
        summary.appendChild(bar);

        list.appendChild(summary);

        if (!videos.length) {
            list.appendChild(el('p', 'text-[11px] text-slate-500', 'No lesson yet.'));
            return;
        }

        videos.forEach(function (video, index) {
            const row = el('button', 'w-full text-left p-3 rounded-xl bg-inputBg border border-borderBg transition-colors hover:border-brandBlue/50');
            row.type = 'button';

            const isDone = video.progress && Number(video.progress.completed) === 1;

            if (player.video && Number(player.video.id) === Number(video.id)) {
                row.className += ' border-brandBlue/60 bg-brandBlue/10';
            }

            const head = el('div', 'flex items-center gap-2.5');

            const mark = el('div', 'w-6 h-6 rounded-full flex items-center justify-center shrink-0 ' + (isDone ? 'bg-emeraldSuccess/20 text-emerald-300' : 'bg-inputBg text-slate-400 border border-borderBg'));
            mark.innerHTML = '<i data-lucide="' + (isDone ? 'check' : 'play') + '" class="w-3 h-3"></i>';

            head.appendChild(mark);

            const text = el('div', 'min-w-0 flex-1');
            text.appendChild(el('p', 'text-xs font-bold text-white truncate', video.title));

            const meta = [];
            if (video.duration_seconds) meta.push(duration(video.duration_seconds));
            if (isDone) meta.push('done');
            else if (video.progress && video.progress.position_seconds) {
                meta.push('stopped at ' + duration(video.progress.position_seconds));
            }

            if (meta.length) text.appendChild(el('p', 'text-[10px] text-slate-400 truncate', meta.join(' - ')));

            head.appendChild(text);
            row.appendChild(head);

            row.addEventListener('click', function () {
                playVideo(course, video);
            });

            list.appendChild(row);
        });

        QN.icons();
    }

    /** Plays a video of the course. */
    function playVideo(course, video) {
        const frame = field('playerFrame');
        if (!frame) return;

        player.video = video;
        player.course = course;

        frame.innerHTML = '';

        const source = video.source || video.url || video.file_path || '';

        if (!source) {
            frame.appendChild(el('p', 'text-xs text-slate-500', 'This video has no address.'));
            renderPlaylist(course);
            return;
        }

        // Where the student stopped the last time.
        const saved = Math.max(
            Number(video.progress && video.progress.position_seconds) || 0,
            localPosition(video.id)
        );

        if (video.provider === 'YOUTUBE' || video.provider === 'VIMEO') {
            const frameElement = document.createElement('iframe');
            frameElement.src = saved > 5 ? source + (source.indexOf('?') > -1 ? '&' : '?') + 'start=' + Math.floor(saved) : source;
            frameElement.className = 'w-full h-full';
            frameElement.setAttribute('allowfullscreen', '');
            frameElement.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
            frameElement.setAttribute('title', video.title || 'The video');
            frame.appendChild(frameElement);
        } else {
            const videoElement = document.createElement('video');
            videoElement.src = source;
            videoElement.className = 'w-full h-full';
            videoElement.controls = true;
            videoElement.preload = 'metadata';
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('data-video-id', String(video.id));

            // The video starts where it was left.
            if (saved > 5) {
                videoElement.addEventListener('loadedmetadata', function () {
                    try {
                        videoElement.currentTime = saved;
                    } catch (err) {
                        /* the browser says no */
                    }
                });
            }

            // The position is kept while the student watches.
            videoElement.addEventListener('timeupdate', function () {
                saveLocalPosition(video.id, videoElement.currentTime);
                savePosition(video.id, videoElement.currentTime, false);
            });

            videoElement.addEventListener('ended', function () {
                markDone(video);
            });

            frame.appendChild(videoElement);
        }

        QN.setText('modalTitle', video.title);
        QN.setText(
            'modalInstructor',
            (course.instructor ? course.instructor + ' - ' : '') + course.subject
        );

        updatePlayerBar(course, video);
        renderPlaylist(course);
    }

    /** The bar under the player: the lessons done, the next one, the speed. */
    function updatePlayerBar(course, video) {
        const videos = course.videos || [];
        const index = videos.findIndex(function (item) {
            return Number(item.id) === Number(video.id);
        });

        const next = index > -1 ? videos[index + 1] : null;

        const nextButton = field('playerNext');
        if (nextButton) {
            nextButton.classList.toggle('hidden', !next);
            nextButton.onclick = function () {
                if (next) playVideo(course, next);
            };
            const label = nextButton.querySelector('span');
            if (label && next) label.textContent = next.title;
        }

        const doneButton = field('playerDone');
        if (doneButton) {
            const isDone = video.progress && Number(video.progress.completed) === 1;
            doneButton.classList.toggle('hidden', isDone);
            doneButton.onclick = function () {
                markDone(video);
            };
        }

        const speed = field('playerSpeed');
        if (speed) {
            speed.onchange = function () {
                const element = document.querySelector('#playerFrame video');
                if (element) element.playbackRate = Number(speed.value) || 1;
            };
        }
    }

    /** Saves the position of a video in the database (a signed in student). */
    async function savePosition(videoId, seconds, done) {
        if (!videoId) return;

        try {
            await QN.api('/api/courses/progress', {
                method: 'POST',
                body: {
                    videoId: videoId,
                    position: Math.round(seconds || 0),
                    completed: done ? 1 : 0,
                },
            });
        } catch (err) {
            // The position is in the browser anyway - a failed sync is not
            // worth a message here.
            console.warn('[courses] the position could not be saved:', err.message);
        }
    }

    /** Marks a lesson as done. */
    async function markDone(video) {
        if (!video || player.saving) return;

        player.saving = true;

        try {
            await QN.api('/api/courses/progress', {
                method: 'POST',
                body: { videoId: video.id, position: 0, completed: 1 },
            });

            video.progress = video.progress || {};
            video.progress.completed = 1;

            saveLocalPosition(video.id, 0);

            if (player.course) {
                player.course.videos.forEach(function (item) {
                    if (Number(item.id) === Number(video.id)) {
                        item.progress = { position_seconds: 0, completed: 1 };
                    }
                });
            }

            renderPlaylist(player.course);
            updatePlayerBar(player.course, video);

            QN.toast('"' + video.title + '" is done.');
        } catch (err) {
            if (err.offline) {
                QN.retry(err.message, function () {
                    markDone(video);
                });
            } else {
                QN.toast(err.message, 'error');
            }
        } finally {
            player.saving = false;
        }
    }

    function closeCourseModal() {
        const modal = field('courseModal');
        if (!modal) return;

        // Stop the video before the modal goes away.
        const frame = field('playerFrame');
        if (frame) frame.innerHTML = '';

        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    /* ------------------------------------------------------------------ */
    /* The cards                                                           */
    /* ------------------------------------------------------------------ */

    /** The whole course card opens the course, not only its button. */
    function initCourseCards() {
        const cards = QN.$$('.course-card');

        cards.forEach(function (card) {
            const open = function (event) {
                // The buttons inside the card keep their own behaviour.
                if (event && event.target.closest('button, a')) return;

                const id = card.dataset.course;
                if (id) openCoursePlayer(id);
            };

            card.addEventListener('click', open);

            card.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open();
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /* Expose + init                                                      */
    /* ------------------------------------------------------------------ */

    window.filterCourses = filterCourses;
    window.openCoursePlayer = openCoursePlayer;
    window.closeCourseModal = closeCourseModal;

    QN.onReady(function () {
        QN.icons();
        initCourseCards();
    });
})();
