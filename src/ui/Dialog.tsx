import * as RadixDialog from "@radix-ui/react-dialog";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx.ts";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

type DialogContentProps = Omit<ComponentProps<typeof RadixDialog.Content>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
};

export function DialogContent({
  title,
  description,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <RadixDialog.Content
        // Without a description, tell Radix there is none rather than leaving it dangling.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cx(
          "fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
          "rounded-card border border-line bg-raised p-6 text-fg shadow-raised focus-visible:outline-none",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          className,
        )}
        {...props}
      >
        <RadixDialog.Title className="text-md font-semibold">{title}</RadixDialog.Title>
        {description && (
          <RadixDialog.Description className="mt-1 text-base text-fg-2">
            {description}
          </RadixDialog.Description>
        )}
        <div className="mt-5">{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("mt-6 flex justify-end gap-2", className)} {...props} />;
}
