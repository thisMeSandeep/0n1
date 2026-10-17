import { ArrowRightIcon, TrashIcon } from "@phosphor-icons/react";
import { designStore, useDesign } from "../store/index.ts";
import { Button } from "../ui/Button.tsx";
import { InspectorHeader, InspectorSection } from "./InspectorHeader.tsx";

/** The inspector for one selected connection. Live rate and latency arrive in S32. */
export function ConnectionView({ edgeId, onClose }: { edgeId: string; onClose: () => void }) {
  const edge = useDesign((s) => s.doc.edges.find((e) => e.id === edgeId));
  const from = useDesign((s) => s.doc.nodes.find((n) => n.id === edge?.source));
  const to = useDesign((s) => s.doc.nodes.find((n) => n.id === edge?.target));
  if (!edge || !from || !to) return null;

  const replication = from.type === "database" && to.type === "read-replica";

  return (
    <>
      <InspectorHeader
        icon={<ArrowRightIcon aria-hidden className="size-4.5 text-fg-2" />}
        title={<h2 className="px-1.5 text-md leading-7 font-semibold">Connection</h2>}
        subtitle={`${from.name} → ${to.name}`}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        <InspectorSection title="About">
          <p className="text-base text-fg">
            {replication
              ? `Every write on ${from.name} is copied to ${to.name}.`
              : `${from.name} sends requests to ${to.name}.`}
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
