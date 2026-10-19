# 04 — Bug classes, not-covered list, style at every depth

**What to build:** Findings name their bug class and list every instance, so one fix covers them all. Every review ends with a list of what the checks don't cover: untested paths, behavior only visible in the UI, and anything the reviewers couldn't verify. Style and code-smell findings are kept, as minor. The card panel shows a finding's class and instance count, and the review shows its not-covered list.

**Blocked by:** 03 — Verified findings.

**Status:** done

- [x] The report carries a per-finding `class` alongside its existing locations (the instances), and a report-level `notCovered` list.
- [x] The finder prompts ask for the class and every instance, not just the first.
- [x] The card panel shows the class and instance count on a finding. The diff shows each instance at its location.
- [x] The review panel shows the not-covered list. An empty list says so plainly.
- [x] Style and code-smell findings appear as minor. They're no longer dropped.
- [x] Report parsing tests cover the new fields and old reports.
