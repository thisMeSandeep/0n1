import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useState } from "react";
import { downloadDataUrl } from "../app/files.ts";
import { slug } from "../storage/backup.ts";
import { designStore, selectionStore, uiStore, useDesign, useUi } from "../store/index.ts";
import { Button } from "../ui/Button.tsx";
import { ChoiceField } from "../ui/ChoiceField.tsx";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "../ui/Dialog.tsx";
import { SwitchField } from "../ui/Switch.tsx";
import { toast } from "../ui/Toast.tsx";
import { useTheme } from "../ui/theme/ThemeProvider.tsx";
import {
  captureCanvas,
  type ImageArea,
  type ImageFormat,
  type ImageOptions,
  imageFileName,
} from "./image.ts";

const FORMATS = [
  { value: "png", label: "PNG" },
  { value: "svg", label: "SVG" },
] as const;

const AREAS = [
  { value: "system", label: "Whole system" },
  { value: "view", label: "Current view" },
] as const;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** ⋯ → Download image: PNG or SVG, the whole system or the view, optionally transparent. */
export function ImageExportDialog() {
  const open = useUi((s) => s.imageExportOpen);
  const empty = useDesign((s) => s.doc.nodes.length === 0);
  const { resolved } = useTheme();
  const flow = useReactFlow();
  const store = useStoreApi();
  const [options, setOptions] = useState<ImageOptions>({
    format: "png",
    area: "system",
    transparent: false,
  });
  const [busy, setBusy] = useState(false);
  // An empty system has no "whole system" to draw.
  const area: ImageArea = empty ? "view" : options.area;

  const setOpen = (next: boolean) => uiStore.getState().setImageExportOpen(next);

  const download = async () => {
    // React Flow's own element, `.react-flow`.
    const target = store.getState().domNode;
    if (!target) return;
    setBusy(true);
    // Selection rings and focus aren't part of the design: clear them while drawing.
    const selection = selectionStore.getState();
    const { nodeIds, edgeIds } = selection;
    (document.activeElement as HTMLElement | null)?.blur();
    selection.clear();
    try {
      await nextFrame();
      await nextFrame();
      const url = await captureCanvas(target, flow.getNodes(), { ...options, area });
      downloadDataUrl(imageFileName(slug(designStore.getState().doc.name), options.format), url);
      setOpen(false);
    } catch (error) {
      console.error("0n1: image export failed", error);
      toast({
        title: "Couldn't make the image",
        description: "Try again, or try the other format.",
      });
    } finally {
      selectionStore.getState().select({ nodeIds, edgeIds });
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Download image"
        description={`The image uses the current ${resolved} theme, and shows the numbers as they are now.`}
      >
        <div className="flex flex-col gap-5">
          <ChoiceField
            label="Format"
            value={options.format}
            options={FORMATS}
            onChange={(format) => setOptions({ ...options, format: format as ImageFormat })}
            hint={
              options.format === "svg"
                ? "Opens in any browser. Some design tools show SVGs like this one poorly."
                : undefined
            }
          />
          <ChoiceField
            label="Area"
            value={area}
            options={AREAS}
            disabled={empty}
            onChange={(next) => setOptions({ ...options, area: next as ImageArea })}
          />
          <SwitchField
            label="Transparent background"
            checked={options.transparent}
            onChange={(transparent) => setOptions({ ...options, transparent })}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="primary" onClick={() => void download()} disabled={busy}>
            <DownloadSimpleIcon />
            {busy ? "Preparing…" : `Download ${options.format.toUpperCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
