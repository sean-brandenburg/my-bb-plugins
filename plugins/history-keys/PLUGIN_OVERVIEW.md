Ctrl+O and Ctrl+I go back and forward through bb's pages, as in vim.

## What you get

- Ctrl+O goes back and Ctrl+I goes forward, the same as bb's back and forward buttons.
- Both are rebindable under Settings → Keyboard as "Go back" and "Go forward".
- Pairs with Slim sidebar, which hides bb's back and forward buttons to fit its rail; these keys are how you step through history there.

## How it works

The commands click bb's own back and forward buttons, which stay mounted even when Slim sidebar hides them, so bb's history rules still apply and a key does nothing when its button is disabled. If bb's buttons aren't on the page, the commands step the window's history instead.
