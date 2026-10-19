# 14 — Reading plan and Scrutinize gate

**What to build:** The brief's reading plan opens the narrative stepper, built by the narrative thread, filtered by level:

- **Glance:** the evidence and not-covered list only;
- **Read:** key files;
- **Scrutinize:** key and supporting files;
- **mechanical files:** always collapsed.

At Scrutinize, Accept stays disabled until every file in the plan is marked Viewed in the changes view. The stepper offers to mark a file Viewed once every step touching it has been visited. I can change the level with a reason, which is stored, and my level holds until the head moves.

**Blocked by:** 12 — Handoff brief; the narrative code review's stepper (other thread) being on main.

**Status:** done

- [x] The reading plan opens the stepper with the level's filter, using per-step file refs and the reading order's role and risk.
- [x] At Scrutinize, Accept shows how many plan files are still unviewed, and enables when none are.
- [x] Changing the level asks for a reason, recomputes the plan and the gate, and is undone when the head moves.
- [x] Without a narrative yet, the plan falls back to the tour's reading order list.
- [x] Keyboard paths exist for opening the plan and changing the level.
