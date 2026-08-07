/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        page: "#F7FAFC",
        primary: {
          DEFAULT: "#0F4C75",
          light: "#3E7CA6",
          dark: "#0A3A5C",
        },
        sage: {
          DEFAULT: "#7FB8A4",
          light: "#A8D0C1",
        },
        ink: "#1F2937",
        line: "#E2E8F0",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};