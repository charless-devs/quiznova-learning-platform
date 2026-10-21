/* ==========================================================================
   QuizNova - theme bootstrap
   Loaded in the <head> so the stored theme is applied before the first
   paint (no flash of the wrong colours).
   ========================================================================== */

(function () {
    'use strict';

    const KEY = 'qn-theme';

    function stored() {
        try {
            return window.localStorage.getItem(KEY);
        } catch (err) {
            return null;
        }
    }

    const theme = stored() === 'light' ? 'light' : 'dark';
    const root = document.documentElement;

    root.classList.toggle('light', theme === 'light');
    root.classList.toggle('dark', theme === 'dark');
})();
