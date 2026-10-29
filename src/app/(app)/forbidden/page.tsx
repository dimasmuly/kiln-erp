import { ShieldX } from "lucide-react";

import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";

export const metadata = { title: "Access denied" };
export const instant = false;

export default function ForbiddenPage() {
  return (
    <Card>
      <EmptyState icon={<ShieldX />} title="You don't have access to this page" action={<LinkButton href="/dashboard">Back to dashboard</LinkButton>}>
        Your role does not include this permission. Ask an administrator if you need it.
      </EmptyState>
    </Card>
  );
}
