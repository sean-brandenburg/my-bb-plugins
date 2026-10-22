---
name: activity
description: How to get usage data about bb and its plugins from the Activity log plugin: which buttons get clicked, which vim key commands run, which pages open, per plugin, with mouse-vs-keyboard counts. Use when deciding whether a feature or key is used, before pruning or redesigning a plugin surface, or when the user asks what they use most.
---

The Activity log plugin records every click, vim key command (announced by `bb-vim-keys`), other key pressed outside
a text box, and page opened, attributed to the plugin it happened in (`bb` for bb's own UI). Nothing typed into a
text box is recorded. Events live in the plugin's SQLite file under bb's data directory.

Read it with the CLI:

```sh
bb activity top --since 30d                       # most-used controls and keys, every kind
bb activity top --since 30d --kind command --plugin kanban   # a plugin's key commands
bb activity top --since 30d --kind click --json   # per control: count, pointer, keyboard, lastAt
bb activity plugins --since 30d                   # events per plugin
bb activity recent --limit 50                     # the latest events, newest first
bb activity prune --before 90d                    # delete old events
```

`--since` takes `24h`, `7d`, `2w`, `30d`, or `all`. `--json` on `top` returns `{ total, plugins, items, firstAt }`
where each item has `plugin`, `kind` (`click`, `command`, `key`, `route`), `key` (the grouping), `label` (a sample
reading), `count`, `pointer`, `keyboard`, and `lastAt`.

How to read it:

- A key command absent from `--kind command` over a month is a candidate to drop from that plugin's keymap and `?`
  list. Compare against the plugin's `KEYMAP`.
- A control with many `pointer` clicks and no `keyboard` ones wants a key.
- A plugin with few events overall may not be worth more work; check `plugins` first.
- Keys appear as `command` only when they went through `bb-vim-keys`; a `key` row is bb's own shortcut, a ⌘ chord,
  or a key nothing bound. vim-mode's text-box editing commands aren't recorded at all.

The same data is on the Activity page in the sidebar (`j`/`k`, `1`–`4` ranges, `c` kinds, `/` filter, `?`).
