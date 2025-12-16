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
