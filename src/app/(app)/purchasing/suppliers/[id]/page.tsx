import { notFound } from "next/navigation";

import { orNotFound } from "@/components/documents";
import { PartyForm } from "@/components/party-form";
import { PageHeader } from "@/components/ui/page-header";
import { routeId } from "@/lib/params";
import { saveSupplierAction } from "@/server/actions/purchasing";
import { requireUser } from "@/server/auth/session";
import { getParty } from "@/server/modules/masterdata/queries";

export const metadata = { title: "Edit supplier" };
export const instant = false;

export default async function EditSupplierPage(props: PageProps<"/purchasing/suppliers/[id]">) {
  const { ctx } = await requireUser("masterdata.write");
  const id = routeId((await props.params).id);
  if (!id) notFound();
  const party = await orNotFound(getParty(ctx, "supplier", id));
  return (
    <>
      <PageHeader crumbs={[{ label: "Suppliers", href: "/purchasing/suppliers" }, { label: party.code }]} title={party.name} />
      <PartyForm kind="supplier" party={party} action={saveSupplierAction} cancelHref="/purchasing/suppliers" />
    </>
  );
}
