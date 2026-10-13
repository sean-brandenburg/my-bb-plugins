Vim keys for the banners bb shows above the prompt box when a thread is waiting on you: an agent's multiple-choice questions, tool approvals, and plan reviews.

## What you get

- Focus moves into a banner when it appears, so the keys work straight away. A half-typed prompt keeps its focus; Escape out of the prompt box then goes to the banner.
- On a question, `j`/`k` move through the answers and Enter picks one and goes on to the next question, or submits on the last. On a question that takes several answers, Space or `x` toggles one and Enter goes on.
- `i` picks "Other…" and puts you in its text box. Escape comes back out to the answers instead of folding the banner.
- On an approval or plan review, `h`/`l` move across its buttons and Enter presses the one you're on. `j`/`k` scroll the details.
- Once the banner is answered, focus goes back to the prompt box.

## Keys

Questions:

| Key | Does |
| --- | --- |
| `j` / `k` | Next or previous answer |
| `gg` / `G` | First or last answer |
| `h` / `l` | Previous or next question, when bb asks several at once |
| Enter | Pick the answer and go on (submit on the last question) |
| Space / `x` | Pick or toggle the answer without going on |
| `i` | Type your own answer |
| Ctrl-D / Ctrl-U | Scroll the question |
| Esc | Leave your own answer; then fold the banner (bb's) |
| `1`–`9` | Choose that answer (bb's own) |
| `?` | Show these keys |

Approvals and plan reviews:

| Key | Does |
| --- | --- |
| `h` / `l` | Move across the buttons (unfolds the banner first) |
| Enter | Press the button |
| `j` / `k` | Scroll the details |
| Ctrl-D / Ctrl-U | Half a page down or up |
| `gg` / `G` | Top or bottom |
| Esc | Fold the banner (bb's) |
| `?` | Show these keys |

## How it works

A content script watches for bb's question, approval, and plan review banners and handles keys while focus is in one (or nowhere at all). It clicks bb's own buttons, so bb still decides what an answer means. Cmd and Alt shortcuts, digits, and keys typed in a text box go to bb. The banners are marked `data-vim-ignore`, so Vim Mode leaves them alone and its scroll mode ends when focus moves into one. bb's banner markup isn't a plugin contract, so a bb update may need the selectors adjusted; disabling the plugin restores bb's normal behavior.
