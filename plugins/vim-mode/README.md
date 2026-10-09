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
