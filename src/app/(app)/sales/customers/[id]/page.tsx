import { notFound } from "next/navigation";

import { orNotFound } from "@/components/documents";
import { PartyForm } from "@/components/party-form";
import { PageHeader } from "@/components/ui/page-header";
import { routeId } from "@/lib/params";
import { saveCustomerAction } from "@/server/actions/sales";
import { requireUser } from "@/server/auth/session";
import { getParty } from "@/server/modules/masterdata/queries";

export const metadata = { title: "Edit customer" };
export const instant = false;

export default async function EditCustomerPage(props: PageProps<"/sales/customers/[id]">) {
  const { ctx } = await requireUser("masterdata.write");
  const id = routeId((await props.params).id);
  if (!id) notFound();
  const party = await orNotFound(getParty(ctx, "customer", id));
  return (
    <>
      <PageHeader crumbs={[{ label: "Customers", href: "/sales/customers" }, { label: party.code }]} title={party.name} />
      <PartyForm kind="customer" party={party} action={saveCustomerAction} cancelHref="/sales/customers" />
    </>
  );
}
