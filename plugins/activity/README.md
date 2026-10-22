# Activity log

Records how bb and its plugins get used, so decisions about what to keep, drop, or give a key to rest on what
actually happens rather than on memory. Nothing is instrumented by hand: one content script watches the whole
window and attributes what it sees to the plugin it happened in.

## What is recorded

| Kind | What | Grouped by |
| --- | --- | --- |
| click | A press on a button, link, menu item, list row, tab, or anything else with a pointer cursor | Its label with numbers blanked, a test id, a link's page, or the list a row sits in (so thread titles don't make a row each) |
| command | A vim key sequence one of the plugins ran (`gg`, `5j`, `/`), announced by `bb-vim-keys` | The sequence |
| key | Any other key pressed outside a text box: bb's own shortcuts, ⌘ chords, keys nothing bound | The key in vim notation (`<D-k>`, `<Esc>`) |
| route | A page opened, with ids blanked (`/threads/*`, `/plugins/kanban/board`) | The page |

Each event also carries the plugin (from bb's `data-bb-plugin` root around it, or the key library's bundle id;
`bb` when it was bb's own UI), the page it happened on, and for clicks whether the mouse or the keyboard made them.
A click made with Enter or Space counts once, as a keyboard click, not as a key too.

Nothing typed into a text box is recorded, and no input values ever are. Events are batched every five seconds
into the plugin's own SQLite file under bb's data directory; nothing leaves the machine.

## Reading it

The **Activity** page in the sidebar ranks what was used, under each plugin, for the last day, week, month, or all
time. `j`/`k` move, `h`/`l` close and open a plugin, `1`–`4` pick the range, `c` cycles clicks, key commands,
other keys, and pages, `/` filters by name, `r` rereads, `?` lists the keys.

From the terminal, or for an agent asked about usage:

```sh
bb activity top --since 30d                 # most-used controls and keys
bb activity top --kind command --plugin kanban
bb activity top --kind click --json         # pointer vs keyboard counts per control
bb activity plugins                         # events per plugin
bb activity recent --limit 20
bb activity prune --before 90d
```

A control with many mouse clicks and no keyboard ones wants a key; a key command with no uses in a month is a
candidate to drop from the keymap.

## How plugins take part

They don't have to. Clicks are attributed through the root bb wraps around every plugin slot, and key commands
through the event `createKeyHandler` in `bb-vim-keys` dispatches after a command runs (`KEY_COMMAND_EVENT`), which
carries the plugin id `bb plugin build` defines into each bundle. A plugin whose keys don't go through the library
shows up only as raw keys.
