# Motion

Two things live here:

- **The Motion plugin**: a content script that keeps `shell.css` active app-wide, giving bb's own interface (menus, dialogs, buttons, lists, page changes) eased, subtle motion.
- **`bb-motion`** (`lib/`): the motion system the other plugins in this repo share. Tokens, prefixed keyframes and classes in `lib/motion.css`, and small React helpers in `lib/index.ts`.

## Rules

1. Only `transform` and `opacity` animate. Never width, height, top/left, margin, padding, box-shadow, colors, or filters. A shadow that should appear on hover lives on a pseudo-element whose opacity animates (`.bbm-lift`). An expanding section lets its height snap and fades and rises its content in.
2. Every animation has a job: feedback on press or hover, an entrance that shows where something came from, a state change (open/closed, selected), or an exit that confirms removal. No ambient or decorative loops.
3. Curves come from tokens: `--bbm-ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`) for almost everything, `--bbm-ease-spring` for things that land (badges, checkmarks, toasts), `--bbm-ease-in` for exits, `--bbm-ease-in-out` for in-place toggles. No `linear`, `ease`, or `ease-in-out` keywords.
4. CSS first. Plugins here are React + Tailwind, and bb appends a plugin's CSS raw after its Tailwind output, so `motion.css` is plain CSS (no `@theme`, `@apply`, `@utility`). Tailwind arbitrary values in class strings still work.
5. Reduced motion is handled once, in `motion.css`: under `prefers-reduced-motion: reduce` the tokens drop every distance and scale to zero and shorten durations, so every `bbm-` class turns into a short opacity fade. Anything outside the `bbm-` classes (a Tailwind `transition-transform`, a hand-written keyframe) needs its own `motion-reduce:` variant or media query.
6. Lists cascade with `STAGGER` plus `stagger(index)`; the cap (`--bbm-stagger-cap`, 10) keeps long lists from dragging on.

## Using bb-motion in a plugin

```jsonc
// package.json
"dependencies": { "bb-motion": "file:../motion/lib" },
"pnpm": { "overrides": { "bb-motion": "link:../motion/lib" } }
```

```ts
// app.tsx, once
import "bb-motion/motion.css";
```

```tsx
import { enter, exit, stagger, STAGGER, PRESS, LIFT, usePresence, cx } from "bb-motion";

{items.map((item, i) => (
  <li key={item.id} className={cx(enter.rise, STAGGER)} style={stagger(i)}>…</li>
))}
```

Then `pnpm install --config.registry=https://registry.npmjs.org/` to link it and update the lockfile.

A library that other plugins bundle (like `diff-view/lib`) must not import `bb-motion`: its bare imports would resolve from its own directory's `node_modules`. Use the `bbm-` class names as strings there; the consuming plugin imports `motion.css`.

## Classes

| Class | What it does |
| --- | --- |
| `bbm-fade-in`, `bbm-rise-in`, `bbm-drop-in`, `bbm-slide-in-left`, `bbm-slide-in-right`, `bbm-scale-in`, `bbm-pop-in` | One-shot entrance on mount. `rise` for content arriving in place, `drop` for things hanging from a trigger above, `slide-*` for panels, `scale` for overlays, `pop` (spring) for small things that land |
| `bbm-stagger` | Delays an entrance by `--bbm-index` × 35ms, capped |
| `bbm-fast`, `bbm-slow` | Speed modifiers for an entrance or exit |
| `bbm-fade-out`, `bbm-sink-out` | Exit, held at the end; pair with `usePresence` |
| `bbm-pop` | One-shot spring bump; retrigger with a `key` change |
| `bbm-nudge` | Short shake for rejected input |
| `bbm-press` | Scales to 0.97 while pressed |
| `bbm-lift` | Hover lift plus a shadow that fades in; needs a positioned element |
| `bbm-reveal` inside `bbm-reveal-host` | Fades and slides in on host hover or focus-within; always shown on touch |
| `bbm-transform`, `bbm-opacity` | Eased transitions for state changes you drive (rotations, swaps) |
| `bbm-chevron` | Rotates 90° when its parent has `aria-expanded="true"` or `data-state="open"`, or an ancestor has `data-bbm-open="true"` |
| `bbm-shimmer` | Loading sheen on a positioned, overflow-hidden block |

tw-animate's `animate-in` / `animate-out` (radix dialogs, menus, popovers) pick up `--bbm-ease-out` / `--bbm-ease-in` automatically, and lose their zoom and slide under reduced motion.

## Gotchas

- An entrance plays on mount, not on re-render: rows with stable React keys don't replay when data refreshes. Rows in a virtualized list remount as they scroll, so they get no entrance.
- Entrances fill backwards only, so once they finish an element's own transform (hover lift, dnd-kit drag transform) is in charge again. Don't put entrance or hover transforms on the element dnd-kit transforms; use an inner wrapper.
- `bbm-press` and `bbm-lift` set `transition`, replacing a Tailwind `transition-colors` on the same element, so colors change instantly there. That's intended (rule 1).
