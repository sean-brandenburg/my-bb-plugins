Collapses bb's sidebar into a thin icon rail under a full-width top bar, as one seamless, opaque frame.

## What you get

- A 52px rail instead of the full-width sidebar. Navigation items (Kanban, Vault, Automations, Plugins, and any plugin pages) show as icons, with the label and shortcut in a tooltip on hover, and badges like Kanban's count in the corner.
- Hidden navigation items and Customize sidebar sit behind a More (…) button. Customize widens the sidebar while bb's editor is open.
- The footer's icons stack vertically at the bottom of the rail.
- The top bar runs the full width of the window with the rail below it, at one height on every page, and page headers indent to clear the macOS window buttons.
- The rail's top row has no room for buttons:
  - Sidebar toggle: Cmd+\ still shows and hides the rail.
  - Back and forward are hidden. Install History keys for Ctrl+O and Ctrl+I in their place.
- Cmd+Click (Ctrl+Click elsewhere) on a rail item opens it in a split.
- The Settings, Plugins, and Skills pages keep bb's full-width sidebar.
- Pairs with History keys for back and forward, and with Minimal top bar, which centers the thread title and clears out the rest of the top bar's buttons.

## How it works

The rail is a sidebar navigation provider (Settings → Appearance → Navigation). A content script adds a stylesheet that narrows bb's sidebar, restacks its footer, and hides the buttons above it, and it measures where the macOS window buttons end so page headers start after them. bb's back and forward buttons stay mounted but hidden, so History keys can still click them. bb's sidebar markup isn't a plugin contract, so a bb update may need this restyle adjusted; disabling the plugin restores bb's normal sidebar and top bar. Phone-width windows keep bb's normal drawer and controls.
