import type { Config } from 'tailwindcss';
import tailwindForms from '@tailwindcss/forms';

export default {
  // Dark mode applies when ANY of these match (Tailwind 3.4+ multi-variant):
  //   - element is inside a `.dark` ancestor (explicit user choice via toggle)
  //   - system prefers dark AND element is not inside a `.light` ancestor
  //     (catches the ~100ms hydration window where @eschricht/nuxt-color-mode
  //     clears the class on <html> while waiting for onNuxtReady to consult
  //     matchMedia, AND the case where the user picked `theme=system` and the
  //     cookie-driven SSR fell back to `light`).
  // Combined with the inline FOUC script + body-bg @media fallback in
  // app.vue, this makes every Tailwind `dark:` variant follow the system
  // preference whenever the class is unresolved or `system`-derived.
  darkMode: [
    'variant',
    [
      '&:is(.dark *)',
      '@media (prefers-color-scheme: dark) { &:where(:not(.light *)) }',
    ],
  ],
  content: [],
  theme: {
    screens: {
      xxs: '450px',
      xs: '576px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
  },
  plugins: [tailwindForms],
} satisfies Config;
