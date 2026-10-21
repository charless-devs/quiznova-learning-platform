/* ==========================================================================
   QuizNova - community (coming soon placeholder)
   ========================================================================== */

(function () {
    'use strict';

    /** Tells the visitor that the space is not open yet. */
    function initNotify() {
        const buttons = QN.$$('[data-community-notify]');
        if (!buttons.length) return;

        buttons.forEach(function (button) {
            button.addEventListener('click', function () {
                QN.toast('We will let you know as soon as the community opens.');
            });
        });
    }

    QN.onReady(function () {
        QN.icons();
        initNotify();
    });
})();
