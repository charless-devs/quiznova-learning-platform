/* ==========================================================================
   QuizNova - the courses of the admin portal
   The admin creates the courses, uploads a video file or sets a link to one.
   ========================================================================== */

(function () {
    'use strict';

    const state = {
        courses: [],
        courseId: null,
    };

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

    /** The size of a file in a readable way. */
    function fileSize(bytes) {
        const size = Number(bytes) || 0;
        if (!size) return '';
        if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
        return (size / (1024 * 1024)).toFixed(1) + ' MB';
    }

    /** The length of a video in a readable way. */
    function duration(seconds) {
        const total = Number(seconds) || 0;
        if (!total) return '';

        const minutes = Math.floor(total / 60);
        const rest = total % 60;

        return minutes + ':' + String(rest).padStart(2, '0');
    }

    /**
     * The icon of the kind of a video.
     *
     * The brand icons of lucide (youtube, vimeo) are not in the library
     * any more, so every kind gets an icon of its own.
     */
    function providerIcon(provider) {
        if (provider === 'FILE') return 'film';
        if (provider === 'YOUTUBE') return 'play-circle';
        if (provider === 'VIMEO') return 'clapperboard';
        return 'link-2';
    }

    /* ------------------------------------------------------------------ */
    /* The list of the courses                                              */
    /* ------------------------------------------------------------------ */

    function renderCourses() {
        const container = field('coursesList');
        if (!container) return;

        container.innerHTML = '';
        QN.setText('coursesCount', state.courses.length + ' courses');

        if (!state.courses.length) {
            container.appendChild(
                el('p', 'text-[11px] text-slate-500 leading-relaxed', 'No course yet - create the first one.')
            );
            return;
        }

        const labels = {
            DRAFT: ['Draft', 'bg-amber-500/20 text-amber-300'],
            PUBLISHED: ['Published', 'bg-emeraldSuccess/20 text-emerald-300'],
            COMPLETED: ['Completed', 'bg-inputBg text-slate-400'],
        };

        state.courses.forEach(function (course) {
            const row = el('button', 'w-full text-left p-3.5 rounded-xl bg-inputBg border border-borderBg transition-colors hover:border-brandBlue/50');
            row.type = 'button';

            // The search of the portal finds the course by its name.
            row.setAttribute(
                'data-course-item',
                (course.title + ' ' + course.subject + ' ' + (course.instructor || '')).toLowerCase()
            );

            if (Number(course.id) === Number(state.courseId)) {
                row.className += ' border-brandBlue/60 bg-brandBlue/10';
            }

            const head = el('div', 'flex items-start gap-2.5');
            const icon = el('div', 'w-8 h-8 rounded-lg bg-brandBlue/15 text-brandBlue flex items-center justify-center shrink-0');
            const glyph = el('i', 'w-4 h-4');
            glyph.setAttribute('data-lucide', course.icon || 'graduation-cap');
            icon.appendChild(glyph);
            head.appendChild(icon);

            const text = el('div', 'min-w-0 flex-1');
            const titleRow = el('div', 'flex items-start justify-between gap-2');
            titleRow.appendChild(el('p', 'text-xs font-bold text-white truncate', course.title));

            const entry = labels[course.status] || labels.DRAFT;
            const status = el('span', 'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0', entry[0]);
            status.className += ' ' + entry[1];
            titleRow.appendChild(status);

            text.appendChild(titleRow);
            head.appendChild(text);
            row.appendChild(head);

            row.appendChild(
                el(
                    'p',
                    'text-[10px] text-slate-400 mt-1.5',
                    course.subject +
                        ' - ' +
                        (course.video_count || 0) +
                        ' video(s)' +
                        (course.duration ? ' - ' + duration(course.duration) : '')
                )
            );

            row.addEventListener('click', function () {
                selectCourse(course.id);
            });

            container.appendChild(row);
        });

        QN.icons();
    }

    /* ------------------------------------------------------------------ */
    /* The videos of the course                                            */
    /* ------------------------------------------------------------------ */

    function renderVideos() {
        const container = field('courseVideos');
        if (!container) return;

        container.innerHTML = '';

        const course = currentCourse();
        const videos = course ? course.videos || [] : [];

        QN.setText('videosCount', videos.length + ' videos');

        if (!course) {
            container.appendChild(
                el('p', 'text-xs text-slate-500 leading-relaxed', 'Pick a course on the left - or create a new one.')
            );
            return;
        }

        if (!videos.length) {
            container.appendChild(
                el(
                    'p',
                    'text-xs text-slate-500 leading-relaxed',
                    'This course has no video yet - upload a file or add a link below.'
                )
            );
            return;
        }

        videos.forEach(function (video) {
            const row = el('div', 'p-3.5 rounded-xl bg-inputBg border border-borderBg space-y-2');

            const head = el('div', 'flex items-start justify-between gap-3');
            const left = el('div', 'flex items-center gap-2.5 min-w-0');

            const icon = el('div', 'w-8 h-8 rounded-lg bg-brandBlue/15 text-brandBlue flex items-center justify-center shrink-0');
            const glyph = el('i', 'w-4 h-4');
            glyph.setAttribute('data-lucide', providerIcon(video.provider));
            icon.appendChild(glyph);
            left.appendChild(icon);

            const text = el('div', 'min-w-0');
            text.appendChild(el('p', 'text-xs font-bold text-white truncate', video.title));

            const meta = [String(video.provider || 'LINK').toLowerCase()];
            if (video.file_size) meta.push(fileSize(video.file_size));
            if (video.duration_seconds) meta.push(duration(video.duration_seconds));
            if (video.file_name) meta.push(video.file_name);

            text.appendChild(el('p', 'text-[10px] text-slate-400 truncate', meta.join(' - ')));
            left.appendChild(text);
            head.appendChild(left);

            const actions = el('div', 'flex items-center gap-1.5 flex-shrink-0');

            const up = el('button', 'p-1.5 rounded-lg bg-inputBg text-slate-400 border border-borderBg hover:text-white transition-colors', '');
            up.type = 'button';
            up.title = 'Move up';
            up.innerHTML = '<i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>';

            const down = el('button', 'p-1.5 rounded-lg bg-inputBg text-slate-400 border border-borderBg hover:text-white transition-colors', '');
            down.type = 'button';
            down.title = 'Move down';
            down.innerHTML = '<i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>';

            const rename = el('button', 'p-1.5 rounded-lg bg-inputBg text-slate-400 border border-borderBg hover:text-brandBlue transition-colors', '');
            rename.type = 'button';
            rename.title = 'Rename';
            rename.innerHTML = '<i data-lucide="pencil" class="w-3.5 h-3.5"></i>';

            const remove = el('button', 'p-1.5 rounded-lg bg-inputBg text-slate-400 border border-borderBg hover:text-rose-400 transition-colors', '');
            remove.type = 'button';
            remove.title = 'Remove';
            remove.innerHTML = '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>';

            up.addEventListener('click', function () {
                moveVideo(video, -1);
            });
            down.addEventListener('click', function () {
                moveVideo(video, 1);
            });
            rename.addEventListener('click', function () {
                renameVideo(video);
            });
            remove.addEventListener('click', function () {
                deleteVideo(video);
            });

            actions.appendChild(up);
            actions.appendChild(down);
            actions.appendChild(rename);
            actions.appendChild(remove);
            head.appendChild(actions);

            row.appendChild(head);
            container.appendChild(row);
        });

        QN.icons();
    }

    /* ------------------------------------------------------------------ */
    /* The course that is open                                             */
    /* ------------------------------------------------------------------ */

    function currentCourse() {
        return state.courses.find(function (course) {
            return Number(course.id) === Number(state.courseId);
        });
    }

    /** Fills the form with the course that is open. */
    function fillForm(course) {
        const title = field('courseTitle');
        const subject = field('courseSubject');
        const instructor = field('courseInstructor');
        const status = field('courseStatus');
        const description = field('courseDescription');
        const badge = field('courseState');

        if (title) title.value = course ? course.title : '';
        if (subject) subject.value = course ? course.subject : '';
        if (instructor) instructor.value = course && course.instructor ? course.instructor : '';
        if (status) status.value = course ? course.status : 'DRAFT';
        if (description) description.value = course && course.description ? course.description : '';

        if (badge) {
            const labels = {
                DRAFT: ['Draft', 'bg-amber-500/20 text-amber-300'],
                PUBLISHED: ['Published', 'bg-emeraldSuccess/20 text-emerald-300'],
                COMPLETED: ['Completed', 'bg-inputBg text-slate-400'],
            };
            const entry = labels[course ? course.status : 'DRAFT'] || labels.DRAFT;

            badge.textContent = course ? entry[0] : 'No course';
            badge.className = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ' + entry[1];
        }
    }

    function selectCourse(id) {
        state.courseId = Number(id);

        const course = currentCourse();
        fillForm(course);
        renderCourses();
        renderVideos();
    }

    /* ------------------------------------------------------------------ */
    /* The database                                                        */
    /* ------------------------------------------------------------------ */

    async function loadCourses() {
        try {
            const data = await QN.api('/api/admin/courses');
            state.courses = data.courses || [];

            if (state.courseId && !currentCourse()) state.courseId = null;
            if (!state.courseId && state.courses.length) state.courseId = state.courses[0].id;

            fillForm(currentCourse());
            renderCourses();
            renderVideos();
        } catch (err) {
            QN.toast('The courses could not be loaded: ' + err.message, 'error');
        }
    }

    /** Saves the course that is open (a new one is created when there is none). */
    async function saveCourse() {
        const title = field('courseTitle');
        const subject = field('courseSubject');
        const instructor = field('courseInstructor');
        const status = field('courseStatus');
        const description = field('courseDescription');

        const body = {
            title: title ? title.value.trim() : '',
            subject: subject ? subject.value : '',
            instructor: instructor ? instructor.value.trim() : '',
            status: status ? status.value : 'DRAFT',
            description: description ? description.value.trim() : '',
        };

        if (!body.title) {
            QN.toast('The course needs a title.', 'error');
            if (title) title.focus();
            return;
        }

        try {
            const data = state.courseId
                ? await QN.api('/api/admin/courses/' + state.courseId, { method: 'PUT', body: body })
                : await QN.api('/api/admin/courses', { method: 'POST', body: body });

            state.courseId = data.course.id;
            await loadCourses();
            selectCourse(state.courseId);

            QN.toast('"' + data.course.title + '" is saved.');
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    async function deleteCourse() {
        const course = currentCourse();
        if (!course) {
            QN.toast('Pick a course first.', 'error');
            return;
        }

        const sure = window.confirm(
            'Remove the course "' + course.title + '"?\n\nThe videos and the uploaded files go with it.'
        );
        if (!sure) return;

        try {
            await QN.api('/api/admin/courses/' + course.id, { method: 'DELETE' });

            state.courseId = null;
            await loadCourses();
            QN.toast('The course is removed.');
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* The videos                                                          */
    /* ------------------------------------------------------------------ */

    /** Adds a video with a link. */
    async function addLink() {
        const course = currentCourse();
        if (!course) {
            QN.toast('Pick a course first.', 'error');
            return;
        }

        const title = field('videoTitle');
        const url = field('videoUrl');

        const body = {
            title: title ? title.value.trim() : '',
            url: url ? url.value.trim() : '',
        };

        if (!body.title || !body.url) {
            QN.toast('The video needs a title and a link.', 'error');
            return;
        }

        try {
            await QN.api('/api/admin/courses/' + course.id + '/videos', { method: 'POST', body: body });

            if (title) title.value = '';
            if (url) url.value = '';

            await loadCourses();
            selectCourse(course.id);
            QN.toast('The video is added.');
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /**
     * Uploads a video file.
     *
     * The file is the body of the request, so no extra library is needed -
     * XMLHttpRequest shows how far the upload is.
     */
    function uploadVideo() {
        const course = currentCourse();
        if (!course) {
            QN.toast('Pick a course first.', 'error');
            return;
        }

        const input = field('videoFile');
        const file = input && input.files && input.files[0];

        if (!file) {
            QN.toast('Choose a video file first.', 'error');
            return;
        }

        const title = field('videoTitle');
        const name = title && title.value.trim() ? title.value.trim() : file.name;

        const box = field('uploadBox');
        const bar = field('uploadBar');
        const percent = field('uploadPercent');
        const uploadName = field('uploadName');

        if (box) box.classList.remove('hidden');
        if (uploadName) uploadName.textContent = file.name;
        if (bar) bar.style.width = '0%';
        if (percent) percent.textContent = '0%';

        const request = new XMLHttpRequest();
        request.open(
            'POST',
            '/api/admin/courses/' + course.id + '/videos/upload?title=' + encodeURIComponent(name)
        );
        request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        request.setRequestHeader('X-File-Name', encodeURIComponent(file.name));

        request.upload.addEventListener('progress', function (event) {
            if (!event.lengthComputable) return;

            const part = Math.round((event.loaded / event.total) * 100);
            if (bar) bar.style.width = part + '%';
            if (percent) percent.textContent = part + '%';
        });

        request.addEventListener('load', async function () {
            let payload = {};
            try {
                payload = JSON.parse(request.responseText || '{}');
            } catch (err) {
                payload = {};
            }

            if (request.status >= 200 && request.status < 300) {
                if (input) input.value = '';
                if (title) title.value = '';

                await loadCourses();
                selectCourse(course.id);
                QN.toast('"' + payload.video.title + '" is uploaded.');
            } else {
                QN.toast(payload.error || 'The upload failed.', 'error');
            }
        });

        request.addEventListener('error', function () {
            QN.toast('The upload failed - the connection broke.', 'error');
        });

        request.send(file);
    }

    /** Renames a video. */
    async function renameVideo(video) {
        const name = window.prompt('The new title of the video', video.title);
        if (!name || !name.trim() || name.trim() === video.title) return;

        try {
            await QN.api('/api/admin/videos/' + video.id, {
                method: 'PUT',
                body: { title: name.trim() },
            });

            await loadCourses();
            selectCourse(state.courseId);
            QN.toast('The title is changed.');
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /** Removes a video. */
    async function deleteVideo(video) {
        const sure = window.confirm('Remove the video "' + video.title + '"?');
        if (!sure) return;

        try {
            await QN.api('/api/admin/videos/' + video.id, { method: 'DELETE' });

            await loadCourses();
            selectCourse(state.courseId);
            QN.toast('The video is removed.');
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /** Moves a video one place up or down. */
    async function moveVideo(video, step) {
        const course = currentCourse();
        if (!course) return;

        const videos = (course.videos || []).slice();
        const index = videos.findIndex(function (item) {
            return Number(item.id) === Number(video.id);
        });

        const target = index + step;
        if (index === -1 || target < 0 || target >= videos.length) return;

        const other = videos[target];
        videos[target] = video;
        videos[index] = other;

        try {
            for (let i = 0; i < videos.length; i += 1) {
                await QN.api('/api/admin/videos/' + videos[i].id, {
                    method: 'PUT',
                    body: { position: i + 1 },
                });
            }

            await loadCourses();
            selectCourse(state.courseId);
        } catch (err) {
            QN.toast(err.message, 'error');
        }
    }

    /* ------------------------------------------------------------------ */
    /* The events                                                          */
    /* ------------------------------------------------------------------ */

    function initEvents() {
        const create = field('coursesNew');
        if (create) {
            create.addEventListener('click', function () {
                state.courseId = null;
                fillForm(null);
                renderCourses();
                renderVideos();

                const title = field('courseTitle');
                if (title) title.focus();
            });
        }

        const save = field('coursesSave');
        if (save) save.addEventListener('click', saveCourse);

        const remove = field('coursesDelete');
        if (remove) remove.addEventListener('click', deleteCourse);

        const link = field('videoAddLink');
        if (link) link.addEventListener('click', addLink);

        const upload = field('videoUpload');
        if (upload) upload.addEventListener('click', uploadVideo);

        // The title of the file follows the file that was picked.
        const picker = field('videoFile');
        const title = field('videoTitle');
        if (picker && title) {
            picker.addEventListener('change', function () {
                const file = picker.files && picker.files[0];
                if (file && !title.value.trim()) title.value = file.name.replace(/\.[^.]+$/, '');
            });
        }
    }

    /* ------------------------------------------------------------------ */
    /* Init                                                                */
    /* ------------------------------------------------------------------ */

    QN.onReady(function () {
        if (!field('coursesList')) return;

        QN.icons();
        initEvents();
        loadCourses();
    });
})();
