import { LogOut, Monitor } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dateTime } from "@/lib/format";
import { signOutEverywhereAction } from "@/server/actions/auth";
import { requireUser } from "@/server/auth/session";
import { permissionsOf, ROLE_LABELS } from "@/server/auth/rbac";
import { mySessions } from "@/server/modules/admin/queries";

export const metadata = { title: "My account" };
export const instant = false;

export default async function AccountPage() {
  const { user, ctx } = await requireUser();
  const sessions = await mySessions(ctx);
  return (
    <>
      <PageHeader title="My account" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Name", value: user.name },
                { label: "Email", value: user.email },
                { label: "Role", value: ROLE_LABELS[user.role] },
                { label: "Permissions", value: <span className="text-[13px] whitespace-normal text-muted">{permissionsOf(user.role).join(", ")}</span> },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Signed-in devices"
            description="Stored in EmberKV. The cookie token is never stored, only its SHA-256."
            actions={
              <form action={signOutEverywhereAction}>
                <Button type="submit" size="sm" variant="danger">
                  <LogOut /> Sign out everywhere
                </Button>
              </form>
            }
          />
          {sessions === null ? (
            <Alert tone="warn" className="m-5">
              The session store is unreachable right now.
            </Alert>
          ) : (
            <ul className="divide-y divide-line">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-5 py-3">
                  <Monitor className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
                  <div className="min-w-0 text-[13px]">
                    <p className="truncate">{s.userAgent ?? "Unknown device"}</p>
                    <p className="text-[12px] text-muted">
                      Signed in {dateTime(s.createdAt)} · expires {s.expiresAt ? dateTime(s.expiresAt) : "never"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
