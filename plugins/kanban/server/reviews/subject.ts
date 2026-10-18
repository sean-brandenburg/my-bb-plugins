import type { Ticket } from "../../shared/board";
import { reviewSubjectSchema, type ReviewSubject } from "../../shared/review";
import { prShortName } from "../github";

/** A PR card's subject is its pull request; other cards have none until their committed work is resolved. */
export function prSubject(ticket: Ticket): ReviewSubject {
  if (ticket.pr === null) throw new Error("Only PR cards can be reviewed");
  const { repo, number, url } = ticket.pr;
  return { kind: "pr", repo, number, url };
}

export function localSubject(commit: string, defaultBranch: string): ReviewSubject {
  return reviewSubjectSchema.parse({ kind: "local", commit, defaultBranch });
}

/** How thread titles name the subject: `widgets#7`, or the commit's short sha. */
export function subjectLabel(subject: ReviewSubject): string {
  return subject.kind === "pr" ? prShortName(subject) : subject.commit.slice(0, 7);
}
