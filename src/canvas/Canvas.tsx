import "@xyflow/react/dist/base.css";
import "./canvas.css";

import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  type EdgeChange,
  type IsValidConnection,
  MiniMap,
  type NodeChange,
  type OnConnectEnd,
  Panel,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import {
  type DragEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EmptyCanvasHint, Welcome } from "../app/Welcome.tsx";
import { registry } from "../components/index.ts";
import { InsightNote } from "../insights/InsightViews.tsx";
import { checkConnection } from "../model/connections.ts";
import { useSimulation } from "../simulation/store.ts";
import { designStore, selectionStore, useDesign, useSelection, useUi } from "../store/index.ts";
import { usePrefersReducedMotion } from "../ui/hooks/useMediaQuery.ts";
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
import { setPlaying } from "./flowDots.ts";
import { COMPONENT_DRAG_TYPE } from "./placement.ts";
import { QuickAdd, type QuickAddRequest } from "./QuickAdd.tsx";
import { useAddComponent } from "./useAddComponent.ts";
import { FIT_VIEW_OPTIONS } from "./useViewActions.ts";
import { VitalsPill } from "./VitalsPill.tsx";
import { ZoomControls } from "./ZoomControls.tsx";

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
  const minimap = useUi((s) => s.minimap);

  const selectedNodes = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const [nodes, setNodes] = useState(() => toFlowNodes([], docNodes, docEdges, selectedNodes));
  useEffect(() => {
    setNodes((previous) => toFlowNodes(previous, docNodes, docEdges, selectedNodes));
  }, [docNodes, docEdges, selectedNodes]);

  useFitViewOnOpen(docNodes.length);
  useFlowDots();

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

  // Quick add: double-click empty canvas, or drop a connection on empty canvas.
  const { screenToFlowPosition } = useReactFlow();
  const [quickAdd, setQuickAdd] = useState<(QuickAddRequest & { key: number }) | null>(null);
  const openQuickAdd = useCallback(
    (screen: { x: number; y: number }, fromNodeId: string | null) =>
      setQuickAdd((current) => ({
        key: (current?.key ?? 0) + 1,
        screen,
        flow: screenToFlowPosition(screen),
        fromNodeId,
      })),
    [screenToFlowPosition],
  );
  const onDoubleClick = useCallback(
    (event: MouseEvent) => {
      if (!(event.target as Element).classList?.contains("react-flow__pane")) return;
      openQuickAdd({ x: event.clientX, y: event.clientY }, null);
    },
    [openQuickAdd],
  );
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connection) => {
      // Only a drop on empty canvas; a drop on any component is handled (or refused) already.
      if (connection.isValid || connection.toNode || !connection.fromNode) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      if (point) openQuickAdd({ x: point.clientX, y: point.clientY }, connection.fromNode.id);
    },
    [openQuickAdd],
  );

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
        onConnectEnd={onConnectEnd}
        onDoubleClick={onDoubleClick}
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
        {/* Centred in the strip right of the zoom controls, so a full pill never covers them. */}
        <Panel
          position="bottom-center"
          className="m-0! mb-6! ml-20! flex flex-col items-center gap-2"
        >
          <InsightNote />
          <VitalsPill />
        </Panel>
        <EmptyCanvasHint />
        <Welcome />
        {minimap && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            ariaLabel="Minimap"
            bgColor="var(--surface)"
            maskColor="var(--scrim)"
            nodeColor="var(--line-strong)"
            nodeBorderRadius={4}
            className="m-0! mr-5! mb-6! overflow-hidden rounded-card border border-line"
          />
        )}
      </ReactFlow>
      {quickAdd && (
        <QuickAdd key={quickAdd.key} request={quickAdd} onClose={() => setQuickAdd(null)} />
      )}
    </div>
  );
}

/**
 * Fit the view once when a system is opened, after its nodes are measured.
 * Never while building: adding the first component to an empty system must
 * not move the view out from under the cursor.
 */
/** Flow dots move while the system runs, and freeze where they are when it pauses. */
function useFlowDots() {
  const running = useSimulation((s) => s.running);
  const reducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    setPlaying(running && !reducedMotion);
    return () => setPlaying(false);
  }, [running, reducedMotion]);
}

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
