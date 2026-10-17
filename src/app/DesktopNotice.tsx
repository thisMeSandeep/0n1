import { Button } from "../ui/Button.tsx";

/** Phones and small windows (UIUX §10, Small screens). */
export function DesktopNotice({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-6">
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        <span className="text-lg font-semibold">0n1</span>
        <p className="text-md text-fg">
          0n1 works best on a desktop or laptop. Building systems needs a bit of room.
        </p>
        <Button onClick={onContinue}>Continue anyway</Button>
      </div>
    </main>
  );
}
