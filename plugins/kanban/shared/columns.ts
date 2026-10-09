/** Column ids the plugin gives meaning to. Users can rename, reorder or remove these columns; cards and agents find them by id. */
export const COLUMN = {
  backlog: "backlog",
  todo: "todo",
  inProgress: "in-progress",
  review: "review",
  done: "done",
} as const;

/** Where finished cards go: the `done` column, else the last one. */
export function doneColumnId(columns: readonly { id: string }[]): string | null {
  return columns.find((column) => column.id === COLUMN.done)?.id ?? columns.at(-1)?.id ?? null;
}

/** Where new and reopened to-dos go: the `todo` column, else the first one. */
export function todoColumnId(columns: readonly { id: string }[]): string | null {
  return columns.find((column) => column.id === COLUMN.todo)?.id ?? columns[0]?.id ?? null;
}
