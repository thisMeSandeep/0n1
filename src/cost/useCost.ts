import { useMemo } from "react";
import { registry } from "../components/index.ts";
import { useLive } from "../simulation/index.ts";
import { useDesign } from "../store/index.ts";
import { type SystemCost, systemCost } from "./model.ts";

/** The open system's estimated cost, following its settings and the run as they change. */
export function useSystemCost(): SystemCost {
  const doc = useDesign((s) => s.doc);
  const snapshot = useLive((s) => s.snapshot);
  return useMemo(() => systemCost(doc, registry, snapshot), [doc, snapshot]);
}
