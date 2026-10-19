# bb plugins

Personal [bb](https://getbb.app) plugins, one directory each under `plugins/`.

| Plugin | What it is |
| --- | --- |
| `kanban` | Kanban board where every card is a thread, with GitHub/Jira sources, PR reviews, diffs, and comments |
| `obsidian` | Browse, edit, and log to an Obsidian vault from bb |
| `grouped-thread-list` | Project switcher: a keyboard-first project and thread picker on double Shift that replaces the sidebar's thread list with counts of threads that need you, are running, or are pinned |
| `vim-mode` | Vim keybindings for bb's prompt box and other text fields |
| `browser-automation-pinned` | bb 0.45.0's built-in browser-automation plugin, frozen under its own id |
| `grpc-client` | gRPC client (method browser, generated request forms, `bb grpc` CLI) on top of grpcurl, with option-driven auth profiles |
| `diff-view` | A thread's changes in its side panel (structural or text diff, viewed marks, symbol peeks, comments sent to the thread), plus the `bb-diff-view` library kanban embeds |
| `composer-status-bar` | Tighter composer footer with model, effort, context-token, and usage-limit segments |
| `thread-header-project` | The thread's project name in front of its title in the thread header |
| `slim-sidebar` | bb's sidebar narrowed to its icon rail under a full-width top bar, with no thread list or macOS title bar row, and Cmd+1–9 for the rail's items |
| `history-keys` | Ctrl+O / Ctrl+I go back and forward |
| `minimal-top-bar` | Hides top-bar buttons that have keyboard equivalents and the Commit button; centers the thread title, which opens the thread menu on click |
| `double-shift-palette` | Double Shift opens the Project switcher (or bb's command palette) |
| `settings-search` | Vim keys for settings: j/k walk the sidebar's pages and the open page's settings, and bb's own settings search gets Ctrl-n/p and hands the cursor to the setting it opens |
| `nerd-font` | Decides whether the plugins here draw Nerd Font icons or their plain fallbacks (Automatic, Always, Never), plus `bb-nerd-font`, the glyph library they share |
| `motion` | Eased, subtle micro-interactions across bb's own UI, plus `bb-motion`, the motion system (tokens, keyframes, React helpers) the other plugins share |
| `prompt-keys` | Vim keys for the questions, tool approvals, and plan reviews bb asks you to answer |
| `local-voice` | Voice input transcribed by a local speech model: whisper.cpp kept warm by the plugin, or any OpenAI-compatible transcription server |
| `no-selection-menu` | Hides the Add to chat / Reply in side chat toolbar bb pops up over highlighted text |

## Install

From a local checkout (rebuild after changes with `bb plugin build plugins/<name>`):

```sh
bb plugin build plugins/<name>
bb plugin install path:$PWD --plugin <name>
```

From GitHub:

```sh
bb plugin install git:github.com/sean-cape/my-bb-plugins@main --plugin <name>
```

## browser-automation-pinned

A frozen copy of bb 0.45.0's built-in browser-automation plugin. It ships only a prebuilt `dist/`, so that directory is committed.
