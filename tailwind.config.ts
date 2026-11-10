import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: '#d5a538',
        'gold-light': '#f1c56a',
        'gold-dark': '#a97918',
        surface: '#0B1525',
        card: '#0F1D30',
      },
      fontFamily: {
        // One font everywhere (Manrope, app/globals.css), including the
        // serif and monospace utilities.
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        serif: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
