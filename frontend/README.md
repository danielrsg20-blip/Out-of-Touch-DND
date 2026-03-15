# Frontend

React 19 + TypeScript + Vite SPA.

## Stack

| Layer | Package | Notes |
| --- | --- | --- |
| UI framework | React 19 + TypeScript | Strict mode — `noUnusedLocals`, `noUnusedParameters` enabled |
| Build | Vite 7 | Dev server on `http://localhost:5174` |
| Styling | Tailwind CSS v4 | Configured via `@tailwindcss/vite` plugin — **no `tailwind.config.js`** |
| Component library | shadcn/ui | Components live in `src/components/ui/`; config at `components.json` |
| Animations | Framer Motion (`motion` v11+) | React 19 compatible; import from `motion/react`, not `framer-motion` |

## Setup

```bash
npm install
npm run dev
```

## Key conventions

### Tailwind v4

Tailwind is configured CSS-first in `src/index.css`:

```css
@import "tailwindcss";

@theme inline {
  --color-accent-gold: var(--accent-gold);
  /* ... maps existing CSS vars to Tailwind color utilities */
}
```

- No `tailwind.config.js` or `postcss.config.js` — the Vite plugin handles everything.
- Use **v4 canonical class names**: `bg-linear-to-br` (not `bg-gradient-to-br`), `shrink-0` (not `flex-shrink-0`).
- Theme tokens from `@theme inline` are available as utilities: `text-accent-gold`, `bg-bg-primary`, etc.

### shadcn/ui

- Components are copied into `src/components/ui/` — edit them directly if needed.
- The `@/` path alias resolves to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- The `cn()` helper is in `src/lib/utils.ts`.
- shadcn CSS variables (`--primary`, `--background`, `--border`, etc.) are mapped to the D&D palette in `:root` inside `src/index.css`.

### Framer Motion

```ts
// Always import from motion/react (not framer-motion)
import { motion, AnimatePresence } from 'motion/react'
```

- Use `motion.div`, `motion.span`, etc. for animated elements.
- Wrap conditional renders in `<AnimatePresence>` for exit animations.
- Tailwind v4 canonical gradient syntax inside `animate` strings: `bg-linear-to-br`.

### CSS migration status

Major components have been migrated from vanilla CSS to Tailwind + shadcn. Remaining vanilla CSS files (`panels.css`, `MapCanvas.css`) are still loaded for panel entry-type colors and canvas overlay styles — these are retained intentionally and coexist with Tailwind utilities.

Do **not** delete `panels.css` or `MapCanvas.css` without replacing all their consumers.
