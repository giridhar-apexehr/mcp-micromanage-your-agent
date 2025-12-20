const { heroui } = require('@heroui/theme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  darkMode: ['class', '.dark-mode'],
  plugins: [
    heroui({
      layout: {
        radius: {
          small: '0.375rem',
          medium: '0.75rem',
          large: '1.125rem',
        },
        borderWidth: {
          small: '1px',
          medium: '2px',
          large: '3px',
        },
        dividerWeight: '1px',
        fontSize: {
          tiny: '0.6875rem',
          small: '0.75rem',
          medium: '0.8125rem',
          large: '0.875rem',
          DEFAULT: '0.8125rem',
        },
        lineHeight: {
          tiny: '1rem',
          small: '1.25rem',
          medium: '1.35rem',
          large: '1.5rem',
          DEFAULT: '1.35rem',
        },
        boxShadow: {
          small:
            '0 10px 22px rgba(15, 23, 42, 0.1), 0 1px 0 rgba(255, 255, 255, 0.4) inset, 0 -1px 0 rgba(15, 23, 42, 0.05) inset',
          medium:
            '0 22px 56px rgba(15, 23, 42, 0.22), 0 1px 0 rgba(255, 255, 255, 0.22) inset',
          large:
            '0 26px 70px rgba(0, 0, 0, 0.55), 0 1px 0 rgba(255, 255, 255, 0.1) inset, 0 -1px 0 rgba(0, 0, 0, 0.4) inset',
        },
        hoverOpacity: 0.9,
        disabledOpacity: 0.6,
      },
      themes: {
        light: {
          colors: {
            background: 'var(--background-color)',
            foreground: 'var(--text-color)',
            content1: 'var(--panel-bg)',
            content2: 'var(--node-bg)',
            content3: 'var(--filter-button-bg)',
            content4: 'var(--filter-button-hover)',
            divider: 'var(--node-border)',
            focus: 'var(--input-focus-border)',
            default: {
              DEFAULT: 'var(--button-secondary-bg)',
              foreground: 'var(--text-color)',
            },
            primary: {
              DEFAULT: 'var(--button-primary-bg)',
              foreground: '#ffffff',
            },
            secondary: {
              DEFAULT: 'var(--button-secondary-bg)',
              foreground: '#ffffff',
            },
            success: {
              DEFAULT: 'var(--status-border-completed)',
              foreground: '#ffffff',
            },
            warning: {
              DEFAULT: 'var(--status-border-needsRefinment)',
              foreground: '#ffffff',
            },
            danger: {
              DEFAULT: 'var(--button-danger-bg)',
              foreground: '#ffffff',
            },
          },
        },
        dark: {
          extend: 'light',
          colors: {
            background: 'var(--background-color)',
            foreground: 'var(--text-color)',
            content1: 'var(--panel-bg)',
            content2: 'var(--node-bg)',
            content3: 'var(--filter-button-bg)',
            content4: 'var(--filter-button-hover)',
            divider: 'var(--node-border)',
            focus: 'var(--input-focus-border)',
          },
        },
      },
    }),
  ],
}
