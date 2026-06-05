/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1D9E75',
        danger:  '#E24B4A',
        warning: '#BA7517',
      },
      borderRadius: { card: '12px' },
    },
  },
  plugins: [],
}
