# Motion

Two things live here:

- **The Motion plugin**: a content script that keeps `shell.css` active app-wide, marks chat rows appended live (`timeline-entrance.ts`), and slides the icon rail's current-item fill between items (`rail-indicator.ts`), giving bb's own interface eased, subtle motion: button presses, menus and popovers growing out of their trigger, dialogs settling in, page changes, new chat rows, the rail's highlight, checkmarks, the scroll-to-latest button.
- **`bb-motion`** (`lib/`): the motion system the other plugins in this repo share. Tokens, prefixed keyframes and classes in `lib/motion.css`; class constants and React helpers in `lib/*.ts(x)`, re-exported from `lib/index.ts`.

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

Then `pnpm install --config.registry=https://registry.npmjs.org/` to link it and update the lockfile. If the plugin's vitest tests import the helpers (not just the CSS), add `resolve: { dedupe: ["react"] }` to its vitest config: `lib/` has no `node_modules`, so Vite can't otherwise resolve `react` from it.

A library that other plugins bundle (like `diff-view/lib`) must not import `bb-motion`: its bare imports would resolve from its own directory's `node_modules`. Use the `bbm-` class names as strings there; the consuming plugin imports `motion.css`.

## Classes

| Class | What it does |
| --- | --- |
| `bbm-fade-in`, `bbm-rise-in`, `bbm-drop-in`, `bbm-slide-in-left`, `bbm-slide-in-right`, `bbm-scale-in`, `bbm-pop-in`, `bbm-check-in` | One-shot entrance on mount. `rise` for content arriving in place, `drop` for things hanging from a trigger above, `slide-*` for panels, `scale` for overlays, `pop` (spring) for small things that land, `check` (spring from 0.6) for checkmarks |
| `bbm-stagger` | Delays an entrance by `--bbm-index` × 35ms, capped at `--bbm-stagger-cap` (10; override it on a subtree for a tighter cascade) |
| `bbm-fast`, `bbm-slow` | Speed modifiers for an entrance or exit |
| `bbm-near` | Shortens an entrance's travel to 4px, for small things and things right next to their trigger |
| `bbm-delayed` | Holds an entrance back 150ms, for loading placeholders that should only show on a slow load |
| `bbm-fade-out`, `bbm-scale-out`, `bbm-sink-out` | Exit, held at the end; pair with `usePresence` or `usePresenceList` |
| `bbm-pop` | One-shot spring bump; retrigger with a `key` change |
| `bbm-nudge` | Short shake for rejected input |
| `bbm-press` | Scales to 0.97 while pressed; add `bbm-soft` (0.985) on full-width rows |
| `bbm-lift` | Hover lift plus a shadow that fades in; needs a positioned element |
| `bbm-reveal` inside `bbm-reveal-host` | Fades and slides in on host hover or focus-within; always shown on touch |
| `bbm-transform`, `bbm-opacity` | Eased transitions for state changes you drive (rotations, swaps) |
| `bbm-chevron`, `bbm-chevron-flip` | Rotates 90° (or 180°) when it or an ancestor has `data-bbm-open="true"` |
| `bbm-shimmer` | Loading sheen on a positioned, overflow-hidden block |

tw-animate's `animate-in` / `animate-out`, bare or behind a variant like `data-[state=open]:`, pick up `--bbm-ease-out` / `--bbm-ease-in` automatically and lose their zoom and slide under reduced motion. Radix popper content (menus, popovers, selects, tooltips, hover cards) grows out of its trigger. `POPOVER_MOTION` is the class set for a radix menu or popover that has no animation of its own.

Radix portals its overlays to `body`, so these two overlay rules can't be scoped to a plugin: they reach bb's own menus and dialogs too, and they ship with every plugin that imports `motion.css`. Disabling the Motion plugin removes `shell.css` (presses, page changes, chat rows, per-overlay timing) but not them, for as long as any other plugin using bb-motion is enabled.

## Helpers

| Helper | Use it for |
| --- | --- |
| `stagger(i)`, `cx(...)` | Cascade index style; class joining |
| `usePresence(open)` | Keep one element mounted through its exit animation |
| `usePresenceList(items, keyOf)` | The same for a keyed list: removed items stay in place, flagged `exiting`, until `onExited(key)` |
| `useListKeys(length)` | Stable keys for a list of bare values, so an exit plays on the removed row |
| `useArrivals(keys)` | Classify keyed items as `intro` (first load: cascade), `new` (arrived later: one entrance), or `null` (seen before: a remount plays nothing) |
| `EntranceScope`, `useLateMount()` | Inside a subtree that already animates in, only things mounted later play their own entrance |
| `useEntrance(className)` | Hold an entrance class until it finishes, so it can't replay |
| `usePopOnChange(value)` | `POP` when a value changes, never on mount or when data first arrives |
| `useChangedSinceMount(value)` | Gate an animation on a change seen in view |
| `useReplay(className)` | Replay `NUDGE`/`POP` without remounting (keeps focus and input) |
| `replay(element, className)` | The same for content scripts, on a DOM element |
| `useFlag(ms)` | A brief confirmation state (copy checkmark) |
| `usePrefersReducedMotion()` | For motion driven from script; CSS adapts on its own |

## Gotchas

- An entrance plays on mount, not on re-render: rows with stable React keys don't replay when data refreshes. Rows in a virtualized list remount as they scroll, so they get no entrance.
- Entrances fill backwards only, so once they finish an element's own transform (hover lift, dnd-kit drag transform) is in charge again. Don't put entrance or hover transforms on the element dnd-kit transforms; use an inner wrapper.
- `bbm-press` and `bbm-lift` set `transition`, replacing a Tailwind `transition-colors` on the same element, so colors change instantly there. That's intended (rule 1).
- Tailwind v4's `rotate-*`, `scale-*`, and `translate-*` utilities set the separate `rotate`/`scale`/`translate` properties, which a `transition: transform` doesn't animate. Drive end states you want eased through `transform` (an inline style or a `[transform:…]` arbitrary property), or use `bbm-chevron`.
- Radix triggers set `aria-expanded` and `data-state="open"` on themselves, so `bbm-chevron` only follows `data-bbm-open`; set it on the disclosure button.
- A virtualized list (bb's chat timeline) remounts rows as they scroll into view, so no CSS entrance can tell a new row from a scrolled-to one. Mark genuinely new rows from script, as `timeline-entrance.ts` does. bb also re-keys rows it regroups (a run of work collapsing into a summary row whose id ends with the first wrapped row's id), so a new id alone doesn't mean new content.
- In jsdom tests React listens for `webkitAnimationEnd`, because jsdom has no `AnimationEvent`.
