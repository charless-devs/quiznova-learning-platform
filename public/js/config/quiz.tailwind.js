/* QuizNova - Tailwind theme for the RAPIDHUNT live coding assessment.
   The surface colours come from the CSS variables in /css/base.css, so the
   theme toggle repaints this page as well. */
window.tailwind = window.tailwind || {};
window.tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                darkBg: 'rgb(var(--qn-page) / <alpha-value>)',
                cardBg: 'rgb(var(--qn-card) / <alpha-value>)',
                navCardBg: 'rgb(var(--qn-nav) / <alpha-value>)',
                mutedBorder: 'rgb(var(--qn-border) / <alpha-value>)',
                codeBg: 'rgb(var(--qn-code) / <alpha-value>)',
                cyanAccent: '#00f2fe',
                tealAccent: '#00d2c4',
                pinkAccent: '#ff4b72',
                orangeAccent: '#ff9f43',
                redAccent: '#ff5252',
            },
            fontFamily: {
                sans: ['Inter', 'Plus Jakarta Sans', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
            },
        },
    },
};
