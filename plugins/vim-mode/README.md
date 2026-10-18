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

`lib/` is the library every plugin here builds its vim-style keys on: key reading, scopes and handlers, row and
index cursors, pickers, menus, `/` search, and the `?` list. Its guide and quickstart are in
[lib/README.md](lib/README.md). After changing it, run `node scripts/check-lib-consumers.mjs vim-mode/lib` from the
repo root to typecheck and test every plugin that uses it.

vim-mode's own scroll mode is built on it too, with bb's own test for keys that belong to a text box (`isEditable`)
in place of the library's `isTextEntry`.
