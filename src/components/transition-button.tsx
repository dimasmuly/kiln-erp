"use client";

import type { ReactNode } from "react";

import { ActionForm } from "@/components/action-form";
import type { ButtonStyle } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/server/actions/result";

/** One document state change (Confirm, Deliver, Invoice…) as an exactly-once form. */
export function TransitionButton({
  action,
  id,
  op,
  idem,
  label,
  pendingLabel,
  confirmMessage,
  variant = "primary",
  icon,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  id: number;
  op: string;
  idem: string;
  label: string;
  pendingLabel: string;
  confirmMessage?: string;
  variant?: ButtonStyle["variant"];
  icon?: ReactNode;
}) {
  return (
    <ActionForm action={action} idem={idem} hidden={{ id, op }} confirmMessage={confirmMessage} feedback="toast">
      <SubmitButton variant={variant} pendingLabel={pendingLabel}>
        {icon}
        {label}
      </SubmitButton>
    </ActionForm>
  );
}
