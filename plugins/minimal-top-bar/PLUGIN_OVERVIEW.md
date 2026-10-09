Clears out bb's top bar: a centered thread title that opens the thread menu, and fewer buttons.

## What you get

- Thread titles sit centered in the top bar, and stay centered while you rename them.
- A click on the title opens the thread menu; a double-click still renames. bb's ⋯ button is gone, but the menu opens where it was, at the title's end.
- Fewer top-bar buttons. Those with a keyboard equivalent are hidden:
  - Open in editor or terminal: Cmd+O.
  - Close pane: Cmd+W.
- bb's Commit button is hidden too.
- Pairs with Slim sidebar, which runs the top bar the full width of the window over its icon rail.

## How it works

A content script adds a stylesheet that hides the top-bar buttons and centers the title, finds bb's Commit button by its text and hides it, and turns a single click on the title into a press of bb's hidden ⋯ trigger, after a short wait so a double-click can still reach rename. bb's top bar markup isn't a plugin contract, so a bb update may need this restyle adjusted; disabling the plugin restores bb's normal top bar. Phone-width windows keep bb's normal controls.
