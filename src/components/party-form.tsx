import { ActionForm } from "@/components/action-form";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/server/actions/result";

interface Party {
  id: number;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  taxId: string | null;
  paymentTermsDays: number;
}

/** Create/edit form shared by customers and suppliers. */
export function PartyForm({
  action,
  party,
  kind,
  cancelHref,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  party?: Party;
  kind: "customer" | "supplier";
  cancelHref: string;
}) {
  return (
    <ActionForm action={action} idem={party ? undefined : crypto.randomUUID()} hidden={{ id: party?.id ?? "" }} className="max-w-3xl">
      <Card>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <Field label="Code" htmlFor="code" hint={`Short unique code, e.g. ${kind === "customer" ? "CUS-ABC" : "SUP-ABC"}`}>
            <Input id="code" name="code" required maxLength={16} defaultValue={party?.code} className="uppercase" />
          </Field>
          <Field label="Legal name" htmlFor="name">
            <Input id="name" name="name" required maxLength={120} defaultValue={party?.name} />
          </Field>
          <Field label="Billing email" htmlFor="email">
            <Input id="email" name="email" type="email" maxLength={120} defaultValue={party?.email ?? ""} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" maxLength={32} defaultValue={party?.phone ?? ""} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" maxLength={60} defaultValue={party?.city ?? ""} />
          </Field>
          <Field label="Tax ID (NPWP)" htmlFor="taxId">
            <Input id="taxId" name="taxId" maxLength={32} defaultValue={party?.taxId ?? ""} placeholder="01.234.567.8-012.000" />
          </Field>
          <Field label="Payment terms (days)" htmlFor="paymentTermsDays" hint={kind === "customer" ? "Invoices are due this many days after issue." : "How long we have to pay."}>
            <Input id="paymentTermsDays" name="paymentTermsDays" type="number" min={0} max={180} required defaultValue={party?.paymentTermsDays ?? 30} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <LinkButton href={cancelHref} variant="ghost">
            Cancel
          </LinkButton>
          <SubmitButton pendingLabel="Saving…">{party ? "Save changes" : `Create ${kind}`}</SubmitButton>
        </div>
      </Card>
    </ActionForm>
  );
}
