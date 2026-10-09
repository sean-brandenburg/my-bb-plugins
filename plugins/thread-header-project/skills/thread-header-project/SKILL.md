---
name: thread-header-project
description: How the Thread header project plugin puts the project name in front of a thread's title and why the composer footer no longer shows the project or environment. Use when the user asks about the `project › title` header, or where the footer's project and environment labels went.
---

The plugin has no commands or settings. It changes each thread's header and composer footer:

- The project name sits in the thread header, before the title (`project › title`). It comes from the sidebar's project list for the thread's project; personal threads show none.
- bb's footer project and environment labels are hidden, since the header names the project and the footer's branch names the environment.
- Phone widths keep bb's stock header and footer, so the project stays in the footer there.

To restore bb's stock header and footer labels, disable the plugin: `bb plugin disable thread-header-project`.
