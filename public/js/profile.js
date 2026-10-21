/* ==========================================================================
   QuizNova - student progress page
   Animates the mastery map and the 7 day trend.
   ========================================================================== */

(function () {
    'use strict';

    /** Fades the radar chart in once the page is on screen. */
    function initRadar() {
        const wrap = document.querySelector('.qn-radar-wrap');
        if (!wrap) return;

        const show = function () {
            wrap.classList.add('is-ready');
        };

        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(
                function (entries) {
                    entries.forEach(function (entry) {
                        if (!entry.isIntersecting) return;
                        show();
                        observer.disconnect();
                    });
                },
                { threshold: 0.2 }
            );
            observer.observe(wrap);
            return;
        }

        show();
    }

    /** Draws the trend line. */
    function initTrend() {
        const line = document.querySelector('.qn-trend-line');
        if (!line || typeof line.getTotalLength !== 'function') return;

        const length = line.getTotalLength();
        line.style.strokeDasharray = length + ' ' + length;
        line.style.strokeDashoffset = length;
        line.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)';

        window.requestAnimationFrame(function () {
            line.style.strokeDashoffset = '0';
        });
    }

    /** Lets the visitor read the subject name of a bubble. */
    function initRadarLabels() {
        const labels = QN.$$('.qn-radar-label');

        labels.forEach(function (label) {
            label.setAttribute('tabindex', '0');
        });
    }

    /* ------------------------------------------------------------------ */
    /* Realtime                                                            */
    /* ------------------------------------------------------------------ */

    /** Rebuilds a list of topics (the strengths or the topics to revise). */
    function renderTopicList(id, topics, color) {
        const list = document.getElementById(id);
        if (!list) return;

        list.innerHTML = '';

        topics.forEach(function (topic) {
            const item = document.createElement('li');

            const head = document.createElement('div');
            head.className = 'flex items-center justify-between text-xs mb-1.5';

            const label = document.createElement('span');
            label.className = 'text-slate-300 font-medium truncate';
            label.textContent = topic.label;

            const value = document.createElement('span');
            value.className = 'font-bold';
            value.style.color = color;
            value.textContent = topic.value + '%';

            head.appendChild(label);
            head.appendChild(value);

            const track = document.createElement('div');
            track.className = 'h-1.5 rounded-full bg-slate-800 overflow-hidden';

            const fill = document.createElement('div');
            fill.className = 'h-full rounded-full';
            fill.style.width = topic.value + '%';
            fill.style.backgroundColor = color;

            track.appendChild(fill);
            item.appendChild(head);
            item.appendChild(track);
            list.appendChild(item);
        });
    }

    /** Paints the whole page with the fresh numbers. */
    function applyProgress(progress) {
        if (!progress) return;

        QN.setText('statLevel', progress.level);
        QN.setText('statPoints', Number(progress.points).toLocaleString('en-US'));
        QN.setText('statStreak', progress.streak + ' days');
        QN.setText('statOverall', progress.overall);
        QN.setText('statQuizzes', progress.quizzes);
        QN.setText('statTime', progress.hours + 'h ' + progress.minutes + 'm');
        QN.setText('statAccuracy', progress.accuracy + '%');

        // The mastery map.
        const area = document.querySelector('.qn-radar-area');
        if (area && progress.radar) area.setAttribute('points', progress.radar.polygonPoints);

        const dots = QN.$$('.qn-radar-dot');
        if (progress.radar) {
            progress.radar.polygon.forEach(function (point, index) {
                if (!dots[index]) return;
                dots[index].setAttribute('cx', point.x);
                dots[index].setAttribute('cy', point.y);
            });
        }

        const scores = QN.$$('[data-subject-score]');
        progress.subjects.forEach(function (subject, index) {
            if (!scores[index]) return;
            scores[index].textContent = subject.score + '%';
            scores[index].style.color = subject.color;
        });

        renderTopicList('strengthsList', progress.strengths, '#10b981');
        renderTopicList('attentionList', progress.attention, '#f59e0b');
    }

    /** Pulls the fresh numbers after a quiz was submitted. */
    async function refreshStats() {
        try {
            const data = await QN.api('/api/profile');
            applyProgress(data.progress);
            QN.toast('Your results are in - the mastery map just grew.');
        } catch (err) {
            // A failed refresh is not worth a toast.
        }
    }

    function initRealtime() {
        QN.realtime.connect(['stats:updated']);

        QN.realtime.on('stats:updated', refreshStats);
    }

    QN.onReady(function () {
        QN.icons();
        initRadar();
        initTrend();
        initRadarLabels();
        initRealtime();
    });
})();
