"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState
        title="This page could not be loaded"
        action={
          <Button onClick={reset}>
            <RotateCcw /> Try again
          </Button>
        }
      >
        An unexpected error occurred{error.digest ? ` (ref ${error.digest})` : ""}. Your data is safe: every change is applied in a single transaction or not at all.
      </EmptyState>
    </Card>
  );
}
