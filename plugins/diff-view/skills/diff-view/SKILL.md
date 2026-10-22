---
name: diff-view
description: How the Diff view plugin shows a thread's changes and delivers the user's review comments. Use when a message in a thread is a batch of "Review comments on your changes", or when the user asks about the Changes button, the side-panel diff, or diff comments.
---

# Diff view

The Changes button in a thread's top bar opens that thread's diff (its
environment against the merge base, or the working tree when no merge base is
known) in the side panel. The user can comment on lines or whole files there.

## Comments sent to the thread

"Send N to the thread" posts one message to the thread that starts with
"Review comments on your changes." Each bullet names a location as
`path:line` (`(old side)` marks a removed line; a bare `path` is a file-level
comment), and replies say which comment they answer. Treat it like review
feedback: address each comment in the code, then summarize what changed. A
```` ```suggestion ```` block in a comment is the exact replacement text for
the lines that comment is on.
Sent comments stay visible in the view but can no longer be edited.

## Settings

- **Hide vendored files** (default on): files under `vendor/`,
  `node_modules/`, `third_party/` and similar stay out of the diff.
- **difftastic binary** (default `difft`): used for the structural diff.
  Install with `brew install difftastic`; without it the view offers the text
  diff instead.
