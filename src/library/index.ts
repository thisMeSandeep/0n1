import { registry } from "../components/index.ts";
import { flushPendingSave, systems } from "../storage/index.ts";
import { designStore } from "../store/index.ts";
import { createLibraryActions } from "./actions.ts";

/** The app's library actions, over the real database and design store. */
export const library = createLibraryActions({
  systems,
  store: designStore,
  registry,
  flush: flushPendingSave,
});
