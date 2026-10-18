Narrows bb's sidebar to its icon rail, so no thread list sits beside it.

## What you get

- Only bb's icon rail on the left: Home, your navigation items, and More (hidden items and Customize rail). bb's own tooltips name each icon. Use the Project switcher for threads.
- The footer's icons (Provider usage, More footer actions, update badges) stack in the rail above Settings instead of hiding with the thread list.
- Cmd+\ hides the rail completely and brings it back.
- Cmd+1 through Cmd+9 (Ctrl elsewhere) open the rail's first nine items in order, Home first. Hold Cmd and each one shows its number in a pill. Cmd+0 returns to the last thread you had open, or from a thread to the one before it. bb keeps a plugin's default off any key one of its own shortcuts holds, even one that only acts in a split, so clear its jump-to-thread and focus-pane-by-number shortcuts once: `for n in 1 2 3 4 5 6 7 8 9; do bb settings keyboard set thread.jump.$n disabled; done; for n in 1 2 3 4 5 6 7 8; do bb settings keyboard set pane.focus.$n disabled; done`. Rebind the "Open sidebar item N" and "Return to the last thread" commands in Settings → Keyboard if you want other keys (the pills keep showing the defaults).
- The Settings, Plugins, and Skills pages keep their list beside the rail.
- On macOS, bb's own title bar runs across the window above the rail, with back, forward, and the sidebar toggle in it.
- Pairs with History keys for back and forward, and with Minimal top bar, which centers the thread title and clears out the rest of the top bar's buttons.

## How it works

Since bb 0.46 the sidebar is bb's icon rail beside the thread list. A content script adds a stylesheet that narrows the sidebar to the rail's width, hides the list, restacks the footer, and makes the collapsed sidebar hide the rail as well. It numbers the rail's buttons for the Cmd+digit commands, which press them. bb's sidebar markup isn't a plugin contract, so a bb update may need this restyle adjusted; disabling the plugin restores bb's normal sidebar. Phone-width windows keep bb's normal drawer.
