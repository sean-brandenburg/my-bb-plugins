Hides the toolbar bb pops up over text you highlight.

## What you get

- Highlighting text in a thread, file preview, or anywhere else bb offers it no longer opens the Add to chat / Reply in side chat / plugin action toolbar.
- Those actions are still on each message's hover actions, and the Vault's daily note capture is still ⌘⇧L.
- Disabling the plugin brings the toolbar back.

## How it works

A content script adds a stylesheet that hides the toolbar's popover by the exact class list bb gives it. bb has no setting or plugin contract for this toolbar, so a bb update that restyles it can bring it back until the selector is updated.
