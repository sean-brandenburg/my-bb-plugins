# bb-plugin-vim-mode

Vim keybindings for bb's prompt box and text boxes, powered by
[`@replit/codemirror-vim-core`](https://www.npmjs.com/package/@replit/codemirror-vim-core).

## Install

```sh
npm install
bb plugin install .
```

## Develop

```sh
npm test          # vim-core's shared 700+ test suite against each backend
npm run typecheck
bb plugin dev     # rebuild and reload on save
```

## `bb-vim-keys`

`lib/` is the library the other plugins here use for their own vim-style keys: kanban, grpc-client, obsidian,
diff-view, prompt-keys and settings-search. It is consumed like `bb-motion`:

```jsonc
// package.json
"dependencies": { "bb-vim-keys": "file:../vim-mode/lib" },
"pnpm": { "overrides": { "bb-vim-keys": "link:../vim-mode/lib" } }
```

and `"allowImportingTsExtensions": true` in the plugin's tsconfig, since the library's own imports end in `.ts`. That
lets node's test runner (grpc-client's and obsidian's tests) load it without a bundler. diff-view's library imports it
by relative path (`../../../../vim-mode/lib/react.ts`), not by name, because other plugins bundle that library.

Two entries:

- `bb-vim-keys` imports nothing, so content scripts and node tests can load it.
  - `keyToken(event)` names a keydown in vim notation: `j`, `G`, `<C-d>`, `<Esc>`, `<CR>`, `<Space>`, `<S-Tab>`. It
    returns null for ⌘ and ⌥ chords, bare modifiers (so Shift between `g` and `O` doesn't break `gO`), and composition.
  - A `Keymap<C>` maps sequences in that notation to commands: `{ j: …, gg: …, "<C-d>": … }`.
  - `createKeyReader(keymap, { counts?, timeoutMs? })` turns tokens into commands. It waits on the start of a
    sequence for up to `SEQUENCE_TIMEOUT_MS` (1000, vim's `timeoutlen`). A key that can't continue the sequence
    starts over on its own.
  - `keymapConflicts` lists sequences that also start a longer one, and `unboundHelpKeys` lists shortcut-list keys
    nothing binds. Each plugin's tests assert both are empty.
  - `bindKeyScope(root, options)` is the window listener for one surface. It takes a key when the key comes from
    inside the root (or `alsoWithin`). With focus on the page body, the key goes to the scope in its `group` that was
    last clicked or focused, else the `primary` one. It never takes a key from a text box, unless that key is Escape
    and `onTextEscape` is set. It also never takes one from a menu or listbox inside the root, or while a
    `blockedBy` overlay (default: open dialogs) is up over the root. Enter and Space stay with a focused button.
  - Row cursors over `[data-nav-row]` lists and trees: `readRows`, `listAction`, `runListMotion`, `runListScroll`,
    `focusRow`, `pageCursor`, `scrollKeepingCursor`, plus `isTextEntry`, `OPEN_DIALOG` and `ANY_OVERLAY`.
- `bb-vim-keys/react` adds `useKeyScope(root, enabled, options)`, `<KeyHelp sections>` (the `?` dialog's grid) and
  `useFocusReturn(open)` (gives focus back after a dialog opened by a key closes). `useKeyScope` rebinds whenever an
  option other than a callback changes, and `takeFocus` runs again on each rebind, so keep keymaps and selectors as
  module constants.

vim-mode's own scroll mode keeps its `isEditable`, which copies bb's own check for keys that belong to a text box.
