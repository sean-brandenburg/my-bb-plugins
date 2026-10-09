import { createContext } from "react";
import type { DiffCommentTarget } from "../../types";
import type { DiffThread } from "./threads";

export interface DiffCommentActions {
  canPostToGithub: boolean;
  onReply: (thread: DiffThread, body: string, target: DiffCommentTarget) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onSetTarget: (id: string, target: DiffCommentTarget) => Promise<void>;
  onDelete: (id: string) => void;
  onOpenThread: (threadId: string) => void;
}

export const DiffCommentsContext = createContext<DiffCommentActions>({
  canPostToGithub: false,
  onReply: async () => {},
  onEdit: async () => {},
  onSetTarget: async () => {},
  onDelete: () => {},
  onOpenThread: () => {},
});
