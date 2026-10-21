/* ==========================================================================
   QuizNova - analytics
   ========================================================================== */

(function () {
    'use strict';

    /** Grows the bars once the page is on screen. */
    function initBars() {
        const fills = QN.$$('.qn-bar__fill');
        if (!fills.length) return;

        // Remember the target height before the bars collapse.
        const targets = fills.map(function (fill) {
            return fill.style.height;
        });

        fills.forEach(function (fill) {
            fill.style.height = '0%';
        });

        window.requestAnimationFrame(function () {
            fills.forEach(function (fill, index) {
                window.setTimeout(function () {
                    fill.style.height = targets[index];
                }, index * 60);
            });
        });
    }

    QN.onReady(function () {
        QN.icons();
        initBars();
    });
})();
