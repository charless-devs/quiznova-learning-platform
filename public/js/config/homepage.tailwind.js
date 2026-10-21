/* QuizNova - Tailwind theme for the homepage.
   Loaded right after the Tailwind CDN script so the config applies before
   the first paint.

   The page colours are driven by CSS variables (see /css/base.css) so the
   theme toggle can repaint the whole site. The variables hold the red,
   green and blue channels, which is what lets Tailwind keep its opacity
   modifiers (bg-cardBg/60) working in both themes. */
window.tailwind = window.tailwind || {};
window.tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#f5f3ff',
                    100: '#ede9fe',
                    200: '#ddd6fe',
                    300: '#c4b5fd',
                    400: '#a78bfa',
                    500: '#8b5cf6',
                    600: '#7c3aed',
                    700: '#6d28d9',
                    800: '#5b21b6',
                    900: '#4c1d95',
                },
                darkBg: 'rgb(var(--qn-page) / <alpha-value>)',
                cardBg: 'rgb(var(--qn-card) / <alpha-value>)',
                borderBg: 'rgb(var(--qn-border) / <alpha-value>)',
            },
            fontFamily: {
                sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
            },
        },
    },
};
