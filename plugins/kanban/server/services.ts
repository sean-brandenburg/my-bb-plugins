import { createBoardStore } from "./board";
import { createCardThreads } from "./card-threads";
import { createCodeReviewThreads } from "./code-review-threads";
import { createDiffComments } from "./comments/diff-comments";
import { createPrComments } from "./comments/pr-comments";
import type { KanbanContext } from "./context";
import { createChanges } from "./diff/changes";
import { createDiffSubjects } from "./diff/subjects";
import { createViewedMarks } from "./diff/viewed";
import { createDumps } from "./dumps";
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
  const diffComments = createDiffComments(ctx, { board, subjects, changes, prComments });
  const reviews = createReviews(ctx, { board, threads, projects, codeReviewThreads });
  const tour = createTour(ctx, { changes, threads, projects, codeReviewThreads });
  const dumps = createDumps(ctx, { board, threads });
  const subtasks = createSubtasks(ctx, { board, threads, projects });
  const sourceSync = createSourceSync(ctx, { board, threads, projects, prComments, reviews });
  const loop = createLoop(ctx, { board, threads, codeReviewThreads, projectSettings, reviews, diffComments, prComments, changes, viewed, tour });
  const reviewResume = createReviewResume(ctx, { reviews, loop });
  return { spend, board, projectSettings, loop, reviewResume, subjects, threads, projects, codeReviewThreads, changes, viewed, prComments, diffComments, reviews, tour, dumps, subtasks, sourceSync };
}

export type Services = ReturnType<typeof createServices>;
