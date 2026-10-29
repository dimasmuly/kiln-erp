import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { relative } from "@/lib/format";
import { createUserAction, revokeUserSessionsAction, setUserActiveAction } from "@/server/actions/admin";
import { requireUser } from "@/server/auth/session";
import { ROLE_LABELS, ROLES } from "@/server/auth/rbac";
import { listUsers } from "@/server/modules/admin/queries";

export const metadata = { title: "Users" };
export const instant = false;

export default async function UsersPage() {
  const { user: me, ctx } = await requireUser("admin.users");
  const rows = await listUsers(ctx);
  const now = ctx.now.getTime();

  return (
    <>
      <PageHeader title="Users & sessions" description="Session counts are read live from EmberKV. Deactivating a user revokes all of their sessions immediately, on every device." />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Table>
            <THead>
              <tr>
                <TH>User</TH>
                <TH>Role</TH>
                <TH>Active sessions</TH>
                <TH>Status</TH>
                <TH numeric>Actions</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <span className="font-medium">{u.name}</span>
                    <span className="block text-[12px] text-muted">{u.email}</span>
                  </TD>
                  <TD>{ROLE_LABELS[u.role]}</TD>
                  <TD className="text-[13px]">
                    {u.sessions === null ? (
                      <span className="text-warn">EmberKV unreachable</span>
                    ) : u.sessions.length === 0 ? (
                      <span className="text-muted">None</span>
                    ) : (
                      <>
                        {u.sessions.length}
                        <span className="block text-[12px] text-muted">last active {relative(now - u.sessions[0].renewedAt)}</span>
                      </>
                    )}
                  </TD>
                  <TD>{u.active ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="neutral" dot>Deactivated</Badge>}</TD>
                  <TD numeric>
                    <div className="flex justify-end gap-2">
                      {!!u.sessions?.length && (
                        <ActionForm action={revokeUserSessionsAction} hidden={{ userId: u.id }} feedback="toast" confirmMessage={`Sign ${u.name} out of every device?`}>
                          <Button type="submit" size="sm" variant="ghost">
                            Sign out all
                          </Button>
                        </ActionForm>
                      )}
                      {u.id !== me.id && (
                        <ActionForm
                          action={setUserActiveAction}
                          hidden={{ userId: u.id, active: String(!u.active) }}
                          feedback="toast"
                          confirmMessage={u.active ? `Deactivate ${u.name}? They are signed out immediately.` : undefined}
                        >
                          <Button type="submit" size="sm" variant={u.active ? "danger" : "secondary"}>
                            {u.active ? "Deactivate" : "Reactivate"}
                          </Button>
                        </ActionForm>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="self-start">
          <CardHeader title="Add a user" />
          <ActionForm action={createUserAction} idem={crypto.randomUUID()} className="space-y-4 px-5 py-4">
            <Field label="Full name" htmlFor="name">
              <Input id="name" name="name" required maxLength={80} />
            </Field>
            <Field label="Work email" htmlFor="email">
              <Input id="email" name="email" type="email" required maxLength={120} />
            </Field>
            <Field label="Role" htmlFor="role">
              <Select id="role" name="role" defaultValue="sales">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Initial password" htmlFor="password" hint="At least 10 characters. Stored as a salted scrypt hash.">
              <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
            </Field>
            <SubmitButton className="w-full" pendingLabel="Creating…">
              Create user
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
