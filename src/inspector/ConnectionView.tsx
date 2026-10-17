import { ArrowRightIcon, TrashIcon } from "@phosphor-icons/react";
import { DEFAULT_NETWORK_LATENCY_MS } from "../engine/network.ts";
import { formatDuration } from "../simulation/format.ts";
import { useLive } from "../simulation/index.ts";
import type { EdgeLive } from "../simulation/live.ts";
import { designStore, useDesign } from "../store/index.ts";
import { Button } from "../ui/Button.tsx";
import { InspectorHeader, InspectorSection } from "./InspectorHeader.tsx";
import { StatValue } from "./LiveSummary.tsx";

/** The inspector for one selected connection: what it carries, and while running how it's doing. */
export function ConnectionView({ edgeId, onClose }: { edgeId: string; onClose: () => void }) {
  const edge = useDesign((s) => s.doc.edges.find((e) => e.id === edgeId));
  const from = useDesign((s) => s.doc.nodes.find((n) => n.id === edge?.source));
  const to = useDesign((s) => s.doc.nodes.find((n) => n.id === edge?.target));
  if (!edge || !from || !to) return null;

  const replication = from.type === "database" && to.type === "read-replica";
  const network = formatDuration(DEFAULT_NETWORK_LATENCY_MS);

  return (
    <>
      <InspectorHeader
        icon={<ArrowRightIcon aria-hidden className="size-4.5 text-fg-2" />}
        title={<h2 className="px-1.5 text-md leading-7 font-semibold">Connection</h2>}
        subtitle={`${from.name} → ${to.name}`}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        <ConnectionLive edgeId={edgeId} />
        <InspectorSection title="About">
          <p className="text-base text-fg">
            {replication
              ? `Every write on ${from.name} is copied to ${to.name}.`
              : `${from.name} sends requests to ${to.name}.`}
          </p>
          <p className="text-sm text-fg-2">
            The network adds {network.value} {network.unit} each way, as within one data centre.
          </p>
        </InspectorSection>
        <div className="pt-6">
          <Button variant="danger" onClick={() => designStore.getState().disconnect([edgeId])}>
            <TrashIcon />
            Delete connection
          </Button>
        </div>
      </div>
    </>
  );
}

/** Rate, p99 round trip and errors on this connection, while a run is loaded. */
function ConnectionLive({ edgeId }: { edgeId: string }) {
  const view = useLive((s) => s.edges[edgeId]);
  if (!view) return null;
  return (
    <section aria-label="Live summary" className="border-b border-line pt-2 pb-4">
      {view.status === "down" ? (
        <p className="text-base text-fg-2">Nothing gets through: one end is down.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <StatValue label="Rate" measure={{ value: view.rate, unit: "/s" }} />
          <StatValue label="p99 round trip" measure={view.latency} />
          <StatValue label="Errors" measure={view.errors} level={errorLevel(view)} />
        </div>
      )}
    </section>
  );
}

const errorLevel = (view: EdgeLive) =>
  view.status === "fail" ? "fail" : view.status === "warn" ? "warn" : "ok";
