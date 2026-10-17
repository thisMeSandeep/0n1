import "@xyflow/react/dist/base.css";
import "./canvas.css";

import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type EdgeChange,
  type NodeChange,
  Panel,
  ReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { designStore, selectionStore, useDesign, useSelection } from "../store/index.ts";
import { useTheme } from "../ui/theme/ThemeProvider.tsx";
import { ComponentEdge } from "./ComponentEdge.tsx";
import { ComponentNode } from "./ComponentNode.tsx";
import {
  applySelectChanges,
  type ComponentFlowNode,
  positionMoves,
  toFlowEdges,
  toFlowNodes,
} from "./flow.ts";
import { FIT_VIEW_OPTIONS, ZoomControls } from "./ZoomControls.tsx";

const nodeTypes = { component: ComponentNode };
const edgeTypes = { component: ComponentEdge };
const SNAP_GRID: [number, number] = [8, 8];
const GRID_GAP = 24;
/** Middle and right mouse buttons pan; left-drag on empty canvas box-selects. */
const PAN_BUTTONS = [1, 2];
const MULTI_SELECT_KEYS = ["Shift", "Meta", "Control"];

const { beginDrag, endDrag } = designStore.getState();

/** The editable canvas, driven by the design and selection stores. */
export function Canvas() {
  const docNodes = useDesign((s) => s.doc.nodes);
  const docEdges = useDesign((s) => s.doc.edges);
  const selectedNodeIds = useSelection((s) => s.nodeIds);
  const selectedEdgeIds = useSelection((s) => s.edgeIds);
  const { resolved } = useTheme();

  const selectedNodes = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const [nodes, setNodes] = useState(() => toFlowNodes([], docNodes, selectedNodes));
  useEffect(() => {
    setNodes((previous) => toFlowNodes(previous, docNodes, selectedNodes));
  }, [docNodes, selectedNodes]);

  const edges = useMemo(
    () => toFlowEdges(docEdges, new Set(selectedEdgeIds)),
    [docEdges, selectedEdgeIds],
  );

  const onNodesChange = useCallback((changes: NodeChange<ComponentFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    const moves = positionMoves(changes);
    if (moves.length > 0) designStore.getState().moveNodes(moves);
    const selection = selectionStore.getState();
    selection.select({ nodeIds: applySelectChanges(selection.nodeIds, changes) });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const selection = selectionStore.getState();
    selection.select({ edgeIds: applySelectChanges(selection.edgeIds, changes) });
  }, []);

  return (
    <div data-testid="canvas" className="absolute inset-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={beginDrag}
        onNodeDragStop={endDrag}
        onSelectionDragStart={beginDrag}
        onSelectionDragStop={endDrag}
        snapToGrid
        snapGrid={SNAP_GRID}
        selectionOnDrag
        panOnDrag={PAN_BUTTONS}
        panOnScroll
        selectionKeyCode={null}
        multiSelectionKeyCode={MULTI_SELECT_KEYS}
        // Space runs the simulation (S29), Delete is handled by our shortcuts (S14),
        // and double-click opens quick add (S13).
        panActivationKeyCode={null}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        nodesConnectable={false}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        colorMode={resolved}
        // 0n1 is free, non-commercial open source, for which React Flow allows hiding this.
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID_GAP}
          size={1.2}
          color="var(--grid-dot)"
        />
        <Panel position="bottom-left" className="m-0! mb-6! ml-5!">
          <ZoomControls />
        </Panel>
      </ReactFlow>
    </div>
  );
}
