/** The canvas surface: a faint 24px dot grid (UIUX §4). React Flow arrives in S09. */
export function Canvas() {
  return (
    <div
      data-testid="canvas"
      className="absolute inset-0 bg-[radial-gradient(var(--grid-dot)_1.2px,transparent_1.3px)] bg-size-[24px_24px]"
    />
  );
}
