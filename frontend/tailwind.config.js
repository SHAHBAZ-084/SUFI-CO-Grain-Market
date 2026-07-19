/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        grain: {
          50: '#fbf8f1',
          100: '#f4ecd9',
          200: '#e8d7b0',
          300: '#d9bc7d',
          400: '#c99f52',
          500: '#b9863d',
          600: '#9f6932',
          700: '#80512c',
          800: '#694228',
          900: '#583724',
        },
      },
    },
  },
  plugins: [],
};
