/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary: dark blue
        navy: {
          950: "#070d1f",
          900: "#0a1330",
          850: "#0d1a3d",
          800: "#112147",
          700: "#182c5c",
          600: "#213a75",
          500: "#2d4a8f",
          400: "#4a68ad",
          300: "#7d93c6",
          200: "#aab9dc",
          100: "#d4dcf0"
        },
        // Accents: purple, yellow, white
        accent: {
          purple: "#8b5cf6",
          "purple-dark": "#6d3fd6",
          "purple-light": "#b69cfb",
          yellow: "#facc15",
          "yellow-dark": "#d4a90a"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"]
      }
    }
  },
  plugins: []
};
