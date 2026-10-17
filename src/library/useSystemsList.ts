import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { systems } from "../storage/index.ts";
import type { SystemSummary } from "../storage/systems.ts";

/** Saved systems, newest first, kept up to date as the database changes. */
export function useSystemsList(): SystemSummary[] | undefined {
  const [list, setList] = useState<SystemSummary[]>();
  useEffect(() => {
    const subscription = liveQuery(() => systems.list()).subscribe({
      next: setList,
      error: (error) => console.error("0n1: could not list systems", error),
    });
    return () => subscription.unsubscribe();
  }, []);
  return list;
}
