Press Shift twice to open the Project switcher, like Search Everywhere in JetBrains IDEs. Without the Project switcher, it opens bb's quick palette instead.

## What you get

- Tap Shift twice within 0.4 seconds, with nothing else in between, to open the Project switcher from anywhere in the bb window. Double Shift again closes it.
- Typing capitals, holding Shift, or using Shift with another modifier never triggers it.

## How it works

Plugins can't run each other's commands, so double Shift sends a window event that the Project switcher answers. When nothing answers (the Project switcher is disabled or not installed), it opens bb's quick palette by replaying the palette's current keyboard shortcut, read from bb each time, so rebinding the palette under Settings → Keyboard keeps the fallback working.
