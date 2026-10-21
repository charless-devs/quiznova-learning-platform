/* QuizNova - Tailwind theme for the registration / login portal.
   The surface colours come from the CSS variables in /css/base.css, so the
   theme toggle repaints this page as well. */
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
                panelBg: 'rgb(var(--qn-card) / <alpha-value>)',
                inputBg: 'rgb(var(--qn-input) / <alpha-value>)',
                borderBg: 'rgb(var(--qn-border) / <alpha-value>)',
            },
            fontFamily: {
                sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
            },
        },
    },
};
