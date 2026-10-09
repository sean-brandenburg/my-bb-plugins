---
name: composer-status-bar
description: How the Composer status bar plugin restyles the bar under a thread's composer and where its model, effort, context-token, and usage-limit segments come from. Use when the user asks about that bar, its numbers, or why it looks different from stock bb.
---

The plugin has no commands or settings. It changes the bar under each thread's composer:

- Model and effort come from the composer's current picker selection. Model names are resolved through `providers.models`, and effort labels through the provider's `reasoningLevels`.
- Context tokens used (the window size is in the hover title) come from the thread's latest `thread/contextWindowUsage/updated` event.
- A usage-limit warning appears only when the latest `provider/rateLimits/updated` event has a window in `warning` or `blocked` status.
- bb's new-thread button is hidden; new threads start from the sidebar or the project picker. The footer has the project / environment labels and the branch on the left, then on the right the limit warning, context, a divider, model · effort, and permission mode last. When the thread-header-project plugin is also installed, it moves the project into the thread header and hides the footer's project and environment labels.
- The branch is quiet text that outlines on hover (click copies its name). The outlined chips are the controls: permission mode, and context (opens the token breakdown).
- A limit warning shows only an icon and the time to reset; hover it for the window name.
- When Nerd Font glyphs render (the nerd-font plugin's check, or its "Nerd Font icons" setting forced to Always), model · effort becomes the family glyph plus version (Opus → crown, Sonnet → feather, Haiku → leaf, Fable → book; other models keep their name after a robot glyph) and an effort glyph: low, medium and high fill a gauge, xhigh is a flame, max a flame with an alert, ultracode a rocket; levels with other ids fill the gauge by their position in the provider's list. The limit icon becomes an hourglass. Without a Nerd Font the bar shows the text labels.
- Narrow footers drop the environment, the project's name (its icon stays), the effort, then the model, so the row never overflows.

There is no dollar cost segment. Claude Code only reports cost in memory (the SDK `result` message and the status line's stdin), and bb doesn't record it.

To restore bb's stock footer, disable the plugin: `bb plugin disable composer-status-bar`.
