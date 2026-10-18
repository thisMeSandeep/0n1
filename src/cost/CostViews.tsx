import { InspectorSection } from "../inspector/InspectorHeader.tsx";
import { selectionStore } from "../store/index.ts";
import { formatMoney } from "./format.ts";
import type { SystemCost } from "./model.ts";
import { useSystemCost } from "./useCost.ts";

/** Where the numbers come from, said every time: it's an estimate. */
function Basis({ cost }: { cost: SystemCost }) {
  return (
    <p className="max-w-[65ch] text-sm text-fg-2">
      An estimate at typical cloud list prices,{" "}
      {cost.live ? "from the traffic in this run." : "from the clients' rates."}
    </p>
  );
}

function Total({ dollars, label }: { dollars: number; label: string }) {
  return (
    <p className="flex items-baseline gap-1 text-md font-medium text-fg">
      <span data-cost={label}>{formatMoney(dollars)}</span>
      <span className="text-xs font-normal text-fg-2">/mo</span>
    </p>
  );
}

/** The system's estimated cost, by component, biggest first (S44). */
export function SystemCostSection() {
  const cost = useSystemCost();
  const priced = cost.components.filter((c) => c.cost.monthly > 0);
  if (priced.length === 0) return null;
  return (
    <InspectorSection title="Estimated cost">
      <div className="flex flex-col gap-2">
        <Total dollars={cost.total} label="system" />
        <ul aria-label="Cost by component" className="-mx-2 flex flex-col">
          {priced.map(({ id, name, cost: own }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => selectionStore.getState().select({ nodeIds: [id], edgeIds: [] })}
                className="flex w-full items-baseline justify-between gap-3 rounded-control px-2 py-1.5 text-left hover:bg-fg/6"
              >
                <span className="truncate text-base text-fg">{name}</span>
                <span className="shrink-0 text-sm text-fg-2">{formatMoney(own.monthly)}/mo</span>
              </button>
            </li>
          ))}
        </ul>
        <Basis cost={cost} />
      </div>
    </InspectorSection>
  );
}

/** One component's estimated cost, and what drives it (S44). Nothing for clients. */
export function ComponentCostSection({ nodeId }: { nodeId: string }) {
  const cost = useSystemCost();
  const own = cost.components.find((c) => c.id === nodeId)?.cost;
  if (!own) return null;
  return (
    <InspectorSection title="Estimated cost">
      <div className="flex flex-col gap-2">
        <Total dollars={own.monthly} label="component" />
        <dl aria-label="What drives the cost" className="flex flex-col gap-1.5 text-sm">
          {own.lines.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-fg-2">{l.label}</dt>
              <dd className="shrink-0 text-fg">{formatMoney(l.monthly)}</dd>
            </div>
          ))}
        </dl>
        <Basis cost={cost} />
      </div>
    </InspectorSection>
  );
}
