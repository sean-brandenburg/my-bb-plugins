---
name: prompt-keys
description: How the Prompt keys plugin adds vim keys to the question, tool approval, and plan review banners bb shows above the prompt box, and why focus moves into them. Use when the user asks how to answer a question or approval from the keyboard, why focus jumped out of the prompt box, or why j/k/h/l/Enter behave a certain way in one of those banners.
---

The plugin has no commands or settings. It acts on the banners bb shows above a thread's prompt box while the thread waits on the user.

- **Focus.** A new banner takes focus when nothing is focused or the same thread's prompt box is empty; a prompt with text in it keeps focus. Escape out of that prompt box moves focus into the waiting banner. After the banner is answered, focus returns to the prompt box.
- **Questions.** `j`/`k` (and `gg`/`G`) move focus through the answers. Enter picks the focused answer and presses Next, or Submit answer on the last question; on a multi-select question Enter only presses Next or Submit. Space or `x` picks or toggles without moving on. `h`/`l` switch between questions when bb asks several. `i` picks "Other…" and focuses its text box, where Escape returns to the answers. Ctrl-D/Ctrl-U scroll the banner.
- **Approvals and plan reviews.** `h`/`l` move across the buttons (Deny, Allow for session, Allow once, or the plan's choices), unfolding a folded banner first; Enter presses the focused button. `j`/`k`, Ctrl-D/Ctrl-U, and `gg`/`G` scroll the details.
- `?` lists the keys. bb's own keys still apply: digits pick an answer, Escape folds an open banner.
- Keys are ignored with Cmd or Alt held, in text boxes, and while a dialog or menu is open.
- The banners get `data-vim-ignore`, so Vim Mode doesn't attach to the "Other…" box and its scroll mode ends when focus enters a banner.

To turn it off: `bb plugin disable prompt-keys`.
