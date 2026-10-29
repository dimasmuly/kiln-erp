import { ServerCrash } from "lucide-react";

import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export const metadata = { title: "Temporarily unavailable" };

/**
 * Shown when EmberKV (the session store) cannot be reached. Sessions fail
 * closed: without the store we cannot know who the user is, so we say so
 * plainly instead of signing anyone out or letting anyone in.
 */
export default function UnavailablePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <EmptyState icon={<ServerCrash />} title="Sign-in service temporarily unavailable" action={<LinkButton href="/dashboard">Try again</LinkButton>}>
        Kiln ERP cannot reach its session store right now. Your data is safe in the database; this usually resolves within a minute.
      </EmptyState>
    </main>
  );
}
