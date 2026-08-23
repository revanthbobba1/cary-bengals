// @ts-check
const { fontFamily } = require('tailwindcss/defaultTheme')
const colors = require('tailwindcss/colors')

/** @type {import("tailwindcss/types").Config } */
module.exports = {
  content: [
    './node_modules/pliny/**/*.js',
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,tsx}',
    './components/**/*.{js,ts,tsx}',
    './layouts/**/*.{js,ts,tsx}',
    './data/**/*.mdx',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      lineHeight: {
        11: '2.75rem',
        12: '3rem',
        13: '3.25rem',
        14: '3.5rem',
      },
      fontFamily: {
        sans: ['var(--font-space-grotesk)', ...fontFamily.sans],
      },
      colors: {
        primary: colors.orange,
        // Secondary accent alongside primary orange — links, secondary actions,
        // gradients/highlights. Also replaces the ad hoc `indigo` used below for code color,
        // so there's one deliberate non-primary hue instead of two.
        accent: colors.indigo,
        gray: colors.gray,
        // Accent-tinted near-black for headline/wordmark text in light mode (pairs with
        // `gray.100` in dark mode) — reads more intentional than flat gray-900 on a page that
        // otherwise leans on the accent hue for depth (shadows, focus rings).
        ink: '#0c0b22',
      },
      // Elevation scale: a card sits *above* the page via shadow, not just an outlined border.
      // `-dark` variants are tuned separately (lighter shadow + faint white hairline) rather than
      // reusing the light-mode values, since a dark shadow barely reads against a dark background.
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        raised: '0 4px 12px -2px rgb(0 0 0 / 0.10), 0 2px 6px -2px rgb(0 0 0 / 0.06)',
        // Matches PollSubmissionForm.tsx's existing whileDrag shadow — keep in sync if that changes.
        overlay: '0 10px 25px -5px rgb(0 0 0 / 0.25), 0 8px 10px -6px rgb(0 0 0 / 0.15)',
        'card-dark': '0 1px 3px 0 rgb(0 0 0 / 0.3), 0 0 0 1px rgb(255 255 255 / 0.04)',
        'raised-dark': '0 4px 16px -2px rgb(0 0 0 / 0.4), 0 0 0 1px rgb(255 255 255 / 0.06)',
        'overlay-dark': '0 20px 40px -8px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.08)',
        // Floating header bar: accent-tinted instead of neutral black, and deepens on scroll
        // (see components/Header.tsx's useScrolled) rather than staying static.
        nav: '0 10px 20px -8px rgb(79 70 229 / 0.06), 0 0 0 1px rgb(15 15 35 / 0.04)',
        'nav-dark': '0 10px 20px -8px rgb(129 140 248 / 0.10), 0 0 0 1px rgb(255 255 255 / 0.05)',
        'nav-scrolled':
          '0 20px 25px -5px rgb(79 70 229 / 0.12), 0 8px 10px -6px rgb(79 70 229 / 0.08), 0 0 0 1px rgb(15 15 35 / 0.05)',
        'nav-scrolled-dark':
          '0 20px 25px -5px rgb(129 140 248 / 0.18), 0 0 0 1px rgb(255 255 255 / 0.07)',
      },
      // Semantic radius aliases so components pick a role (control vs. card vs. overlay) instead
      // of an arbitrary rounded-md/rounded-lg per component (today's inconsistency).
      borderRadius: {
        control: '0.5rem',
        card: '0.75rem',
        overlay: '1rem',
      },
      transitionTimingFunction: {
        // "Expo out" — accelerates at the start, reads as responsive. Default for anything
        // entering/exiting; avoid ease-in for UI (ease-in reads as sluggish).
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            a: {
              color: theme('colors.primary.500'),
              '&:hover': {
                color: `${theme('colors.primary.600')}`,
              },
              code: { color: theme('colors.primary.400') },
            },
            'h1,h2': {
              fontWeight: '700',
              letterSpacing: theme('letterSpacing.tight'),
            },
            h3: {
              fontWeight: '600',
            },
            code: {
              color: theme('colors.accent.500'),
            },
          },
        },
        invert: {
          css: {
            a: {
              color: theme('colors.primary.500'),
              '&:hover': {
                color: `${theme('colors.primary.400')}`,
              },
              code: { color: theme('colors.primary.400') },
            },
            'h1,h2,h3,h4,h5,h6': {
              color: theme('colors.gray.100'),
            },
          },
        },
      }),
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
}
