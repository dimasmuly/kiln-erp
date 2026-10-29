"use client";

import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonStyle } from "./button";

/** Disables itself while its form is submitting: the first line of defense against double submits. */
export function SubmitButton({ children, pendingLabel, disabled, ...props }: ComponentProps<"button"> & ButtonStyle & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
