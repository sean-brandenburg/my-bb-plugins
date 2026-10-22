import { createContext } from "react";
import { NO_SUGGESTIONS, type SuggestionActions } from "./actions";

export type { SuggestionActions } from "./actions";

export const SuggestionsContext = createContext<SuggestionActions>(NO_SUGGESTIONS);
