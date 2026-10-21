/* QuizNova - Tailwind theme for the admin portal.
   The surface colours come from the CSS variables in /css/base.css, so the
   theme toggle repaints this page as well. */
window.tailwind = window.tailwind || {};
window.tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                navyBg: 'rgb(var(--qn-page) / <alpha-value>)',
                cardBg: 'rgb(var(--qn-card) / <alpha-value>)',
                navBg: 'rgb(var(--qn-nav) / <alpha-value>)',
                borderBg: 'rgb(var(--qn-border) / <alpha-value>)',
                inputBg: 'rgb(var(--qn-input) / <alpha-value>)',
                brandBlue: '#0f62fe',
                brandHover: '#0053e6',
                emeraldSuccess: '#10b981',
                coralDanger: '#f43f5e',
                amberWarning: '#f59e0b',
                cyanAccent: '#06b6d4',
                purpleAccent: '#8b5cf6',
            },
            fontFamily: {
                sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
            },
        },
    },
};
