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
import {
  designStore,
  selectionStore,
  uiStore,
  useDesign,
  useSelection,
  useUi,
} from "../store/index.ts";
import { TutorialCard } from "../tutorial/TutorialCard.tsx";
import { usePrefersReducedMotion } from "../ui/hooks/useMediaQuery.ts";
import { Menu, MenuContent, MenuTrigger } from "../ui/Menu.tsx";
import { useTheme } from "../ui/theme/ThemeProvider.tsx";
import { AlignmentGuides } from "./AlignmentGuides.tsx";
import { ALIGN_THRESHOLD_PX, alignDrag, type Guide, shiftDrag } from "./alignment.ts";
import { ComponentActionItems } from "./ComponentActions.tsx";
import { ComponentEdge } from "./ComponentEdge.tsx";
import { ComponentNode } from "./ComponentNode.tsx";
import { ConnectionLine } from "./ConnectionLine.tsx";
import {
  applySelectChanges,
  type CanvasFlowNode,
  positionMoves,
  toFlowEdges,
  toFlowNodes,
} from "./flow.ts";
import { setPlaying } from "./flowDots.ts";
import { NoteActionItems, PaneActionItems } from "./NoteActions.tsx";
import { NoteNode } from "./NoteNode.tsx";
import { COMPONENT_DRAG_TYPE } from "./placement.ts";
import { QuickAdd, type QuickAddRequest } from "./QuickAdd.tsx";
import { useAddComponent } from "./useAddComponent.ts";
import { useClipboardEvents } from "./useClipboard.ts";
import { FIT_VIEW_OPTIONS } from "./useViewActions.ts";
import { VitalsPill } from "./VitalsPill.tsx";
import { ZoomControls } from "./ZoomControls.tsx";

const nodeTypes = { component: ComponentNode, note: NoteNode };
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
  const docNotes = useDesign((s) => s.doc.notes);
  const docEdges = useDesign((s) => s.doc.edges);
  const selectedNodeIds = useSelection((s) => s.nodeIds);
  const selectedEdgeIds = useSelection((s) => s.edgeIds);
  const { resolved } = useTheme();
  const minimap = useUi((s) => s.minimap);

  const selectedNodes = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const [nodes, setNodes] = useState(() =>
    toFlowNodes([], docNodes, docEdges, selectedNodes, docNotes),
  );
  useEffect(() => {
    setNodes((previous) => toFlowNodes(previous, docNodes, docEdges, selectedNodes, docNotes));
  }, [docNodes, docEdges, selectedNodes, docNotes]);

  useFitViewOnOpen(docNodes.length);
  useFlowDots();
  useClipboardEvents();

  const edges = useMemo(
    () => toFlowEdges(docEdges, new Set(selectedEdgeIds)),
    [docEdges, selectedEdgeIds],
  );

  // Alignment guides (M02): a drag lines up with other components as it goes.
  const { screenToFlowPosition, getNodes, getZoom } = useReactFlow<CanvasFlowNode>();
  const [guides, setGuides] = useState<Guide[]>([]);
  /** How far the drag in progress was moved to line up. */
  const dragShift = useRef({ x: 0, y: 0 });
  const endDrag = useCallback(() => {
    endGesture();
    dragShift.current = { x: 0, y: 0 };
    setGuides([]);
  }, []);

  /** Apply node changes to the canvas, the document (moves) and the selection. */
  const applyChanges = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    const moves = positionMoves(changes);
    if (moves.length > 0) designStore.getState().moveNodes(moves);
    const selection = selectionStore.getState();
    selection.select({ nodeIds: applySelectChanges(selection.nodeIds, changes) });
  }, []);

  const onNodesChange = useCallback(
    (incoming: NodeChange<CanvasFlowNode>[]) => {
      let changes = incoming;
      if (changes.some((c) => c.type === "position" && c.dragging)) {
        const aligned = alignDrag(changes, getNodes(), ALIGN_THRESHOLD_PX / getZoom());
        changes = aligned.changes;
        dragShift.current = aligned.shift;
        setGuides(aligned.guides);
      } else if (changes.some((c) => c.type === "position")) {
        // The drop repeats where the drag was before lining up: keep it lined up.
        changes = shiftDrag(changes, dragShift.current);
        dragShift.current = { x: 0, y: 0 };
      }
      applyChanges(changes);
    },
    [getNodes, getZoom, applyChanges],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const selection = selectionStore.getState();
    selection.select({ edgeIds: applySelectChanges(selection.edgeIds, changes) });
  }, []);

  // Clicking a component opens the inspector if it's closed.
  const onNodeClick = useCallback(() => uiStore.getState().requestInspector(), []);

  // Right-clicking a component: its actions, at the pointer. Right-clicking one
  // in the selection acts on the whole selection; any other, on just that one.
  // A note has its own; empty canvas offers a note there, and Paste.
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; kind: "components"; nodeIds: string[] }
    | { x: number; y: number; kind: "note"; noteId: string }
    | { x: number; y: number; kind: "canvas" }
    | null
  >(null);
  const onNodeContextMenu = useCallback((event: MouseEvent, node: CanvasFlowNode) => {
    event.preventDefault();
    const selection = selectionStore.getState();
    const nodeIds = selection.nodeIds.includes(node.id) ? [...selection.nodeIds] : [node.id];
    if (nodeIds.length === 1) selection.select({ nodeIds, edgeIds: [] });
    const at = { x: event.clientX, y: event.clientY };
    setContextMenu(
      node.type === "note" && nodeIds.length === 1
        ? { ...at, kind: "note", noteId: node.id }
        : { ...at, kind: "components", nodeIds },
    );
  }, []);
  // Double-clicking a note writes in it.
  const onNodeDoubleClick = useCallback((_event: MouseEvent, node: CanvasFlowNode) => {
    if (node.type === "note") uiStore.getState().setEditingNote(node.id);
  }, []);
  const onPaneContextMenu = useCallback((event: MouseEvent | globalThis.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, kind: "canvas" });
  }, []);

  // Quick add: double-click empty canvas, or drop a connection on empty canvas.
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
        onNodeDragStop={endDrag}
        onSelectionDragStart={beginGesture}
        onSelectionDragStop={endDrag}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onDoubleClick={onDoubleClick}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
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
        <AlignmentGuides guides={guides} />
        <Panel position="top-left" className="m-0! mt-4! ml-4!">
          <TutorialCard />
        </Panel>
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
      <Menu open={contextMenu !== null} onOpenChange={(open) => !open && setContextMenu(null)}>
        {/* An anchor at the pointer: the menu opens from where you clicked. */}
        <MenuTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed size-0"
            style={{ left: contextMenu?.x ?? 0, top: contextMenu?.y ?? 0 }}
          />
        </MenuTrigger>
        <MenuContent
          align="start"
          side="bottom"
          sideOffset={2}
          aria-label={contextMenu?.kind === "canvas" ? "Canvas actions" : "Component actions"}
          // Focus goes back to the canvas, not the invisible anchor.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {contextMenu?.kind === "components" && (
            <ComponentActionItems nodeIds={contextMenu.nodeIds} />
          )}
          {contextMenu?.kind === "note" && <NoteActionItems noteId={contextMenu.noteId} />}
          {contextMenu?.kind === "canvas" && <PaneActionItems at={contextMenu} />}
        </MenuContent>
      </Menu>
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
