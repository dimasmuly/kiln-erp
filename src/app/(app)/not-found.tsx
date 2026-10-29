import { SearchX } from "lucide-react";

import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";

export default function NotFound() {
  return (
    <Card>
      <EmptyState icon={<SearchX />} title="Not found" action={<LinkButton href="/dashboard">Back to dashboard</LinkButton>}>
        The record you are looking for does not exist or was removed.
      </EmptyState>
    </Card>
  );
}
