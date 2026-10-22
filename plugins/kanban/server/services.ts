import { createBoardStore } from "./board";
import { createCardThreads } from "./card-threads";
import { createCodeReviewThreads } from "./code-review-threads";
import { createDiffComments } from "./comments/diff-comments";
import { createPendingReview } from "./comments/pending-review";
import { createPrComments } from "./comments/pr-comments";
import type { KanbanContext } from "./context";
import { createChanges } from "./diff/changes";
import { createDiffSubjects } from "./diff/subjects";
import { createViewedMarks } from "./diff/viewed";
import { createDumps } from "./dumps";
import { createIntegration } from "./integration";
import { createLoop } from "./loop/loop";
import { createProjectSettings } from "./project-settings";
import { createProjects } from "./projects";
import { createReviewResume } from "./reviews/resume";
import { createReviews } from "./reviews/reviews";
import { createSpend } from "./spend/spend";
import { createSubtasks } from "./subtasks";
import { createSourceSync } from "./sync";
import { createTour } from "./tour";

/** Builds every feature in dependency order; each one only sees the features it is handed. */
export function createServices(ctx: KanbanContext) {
  const spend = createSpend(ctx);
  const board = createBoardStore(ctx, { spend });
  const projectSettings = createProjectSettings(ctx);
  const subjects = createDiffSubjects(ctx, { board });
  const threads = createCardThreads(ctx, { board });
  const projects = createProjects(ctx, { threads });
  const codeReviewThreads = createCodeReviewThreads(ctx);
  const changes = createChanges(ctx);
  const viewed = createViewedMarks(ctx, { changes });
  const prComments = createPrComments(ctx, { board, threads, projects, codeReviewThreads });
  const pendingReview = createPendingReview(ctx, { board, changes });
  const diffComments = createDiffComments(ctx, { board, subjects, changes, prComments, pendingReview });
  const reviews = createReviews(ctx, { board, threads, projects, codeReviewThreads });
  const tour = createTour(ctx, { changes, threads, projects, codeReviewThreads });
  const integration = createIntegration(ctx, { board, threads, projectSettings });
  board.setIntegrationLookup(integration);
  board.onTicketChanged(integration.ticketChanged);
  const dumps = createDumps(ctx, { board, threads, integration });
  const subtasks = createSubtasks(ctx, { board, threads, projects });
  const sourceSync = createSourceSync(ctx, { board, threads, projects, prComments, pendingReview, reviews, tour });
  const loop = createLoop(ctx, { board, threads, codeReviewThreads, projectSettings, reviews, diffComments, prComments, changes, viewed, tour });
  loop.setPhaseListener(integration.ticketChanged);
  const reviewResume = createReviewResume(ctx, { reviews, loop });
  return { spend, board, projectSettings, loop, reviewResume, subjects, threads, projects, codeReviewThreads, changes, viewed, prComments, pendingReview, diffComments, reviews, tour, dumps, integration, subtasks, sourceSync };
}

export type Services = ReturnType<typeof createServices>;
