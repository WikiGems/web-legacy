import { Modal } from "@heroui/react";
import { clsx } from "clsx";
import type { PropsWithChildren } from "react";

export function WebDialog({
  children,
  onClose,
  labelId,
  className,
  busy = false,
  wide = false,
}: PropsWithChildren<{
  onClose: () => void;
  labelId: string;
  className?: string;
  busy?: boolean;
  wide?: boolean;
}>) {
  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Modal.Container size={wide ? "lg" : "md"} scroll="inside">
        <Modal.Dialog
          aria-labelledby={labelId}
          className={clsx("min-w-0 p-4 sm:p-8", className)}
        >
          <Modal.Body className="min-w-0 gap-6">{children}</Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
