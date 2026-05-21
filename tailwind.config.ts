import type { Config } from "tailwindcss";

// Tailwind is set up for utility classes inside JSX, but the bulk of the
// design system lives in app/globals.css (ported verbatim from the prototype's
// tokens.css). We disable preflight so it does not conflict with the
// prototype's own base styles.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "General Sans", "system-ui", "sans-serif"],
        display: ["General Sans", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
