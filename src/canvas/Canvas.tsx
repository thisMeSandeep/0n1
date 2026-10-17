import "@xyflow/react/dist/base.css";
import "./canvas.css";

import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
  Panel,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registry } from "../components/index.ts";
import { checkConnection } from "../model/connections.ts";
import { designStore, selectionStore, useDesign, useSelection } from "../store/index.ts";
import { useTheme } from "../ui/theme/ThemeProvider.tsx";
import { ComponentEdge } from "./ComponentEdge.tsx";
import { ComponentNode } from "./ComponentNode.tsx";
import { ConnectionLine } from "./ConnectionLine.tsx";
import {
  applySelectChanges,
  type ComponentFlowNode,
  positionMoves,
  toFlowEdges,
  toFlowNodes,
} from "./flow.ts";
import { COMPONENT_DRAG_TYPE } from "./placement.ts";
import { useAddComponent } from "./useAddComponent.ts";
import { FIT_VIEW_OPTIONS, ZoomControls } from "./ZoomControls.tsx";

const nodeTypes = { component: ComponentNode };
const edgeTypes = { component: ComponentEdge };
const SNAP_GRID: [number, number] = [8, 8];
const GRID_GAP = 24;
/** Middle and right mouse buttons pan; left-drag on empty canvas box-selects. */
const PAN_BUTTONS = [1, 2];
const MULTI_SELECT_KEYS = ["Shift", "Meta", "Control"];

const { beginGesture, endGesture } = designStore.getState();

const isValidConnection: IsValidConnection = ({ source, target }) =>
  checkConnection(designStore.getState().doc, registry, source, target).ok;

function onConnect({ source, target }: Connection) {
  const result = designStore.getState().connect(source, target);
  if (result.ok) selectionStore.getState().select({ nodeIds: [], edgeIds: [result.edgeId] });
}

/** The editable canvas, driven by the design and selection stores. */
export function Canvas() {
  const docNodes = useDesign((s) => s.doc.nodes);
  const docEdges = useDesign((s) => s.doc.edges);
  const selectedNodeIds = useSelection((s) => s.nodeIds);
  const selectedEdgeIds = useSelection((s) => s.edgeIds);
  const { resolved } = useTheme();

  const selectedNodes = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const [nodes, setNodes] = useState(() => toFlowNodes([], docNodes, docEdges, selectedNodes));
  useEffect(() => {
    setNodes((previous) => toFlowNodes(previous, docNodes, docEdges, selectedNodes));
  }, [docNodes, docEdges, selectedNodes]);

  useFitViewOnOpen(docNodes.length);

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

  // Components dragged in from the palette.
  const { addAtScreenPoint } = useAddComponent();
  const onDragOver = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes(COMPONENT_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);
  const onDrop = useCallback(
    (event: DragEvent) => {
      const type = event.dataTransfer.getData(COMPONENT_DRAG_TYPE);
      if (!registry.get(type)) return;
      event.preventDefault();
      addAtScreenPoint(type, { x: event.clientX, y: event.clientY });
    },
    [addAtScreenPoint],
  );

  return (
    <div data-testid="canvas" className="absolute inset-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={beginGesture}
        onNodeDragStop={endGesture}
        onSelectionDragStart={beginGesture}
        onSelectionDragStop={endGesture}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        connectionLineComponent={ConnectionLine}
        connectionRadius={32}
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
        minZoom={0.2}
        maxZoom={2}
        colorMode={resolved}
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

/**
 * Fit the view once when a system is opened, after its nodes are measured.
 * Never while building: adding the first component to an empty system must
 * not move the view out from under the cursor.
 */
function useFitViewOnOpen(nodeCount: number) {
  const docId = useDesign((s) => s.doc.id);
  const nodesInitialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const fittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (fittedFor.current === docId) return;
    if (nodeCount === 0) {
      fittedFor.current = docId;
      return;
    }
    if (!nodesInitialized) return;
    fitView(FIT_VIEW_OPTIONS);
    fittedFor.current = docId;
  }, [docId, nodeCount, nodesInitialized, fitView]);
}
