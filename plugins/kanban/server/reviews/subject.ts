import type { Ticket } from "../../shared/board";
import { reviewSubjectSchema, type PrReviewSubject, type ReviewSubject } from "../../shared/review";
import { prShortName } from "../github";

/** The review subject of a PR card's pull request. */
export function prSubject(ticket: Ticket): PrReviewSubject {
  if (ticket.pr === null) throw new Error("Not a PR card");
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
