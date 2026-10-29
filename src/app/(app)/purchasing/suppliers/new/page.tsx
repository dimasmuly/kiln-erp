import { PartyForm } from "@/components/party-form";
import { PageHeader } from "@/components/ui/page-header";
import { saveSupplierAction } from "@/server/actions/purchasing";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "New supplier" };
export const instant = false;

export default async function NewSupplierPage() {
  await requireUser("masterdata.write");
  return (
    <>
      <PageHeader crumbs={[{ label: "Suppliers", href: "/purchasing/suppliers" }, { label: "New" }]} title="New supplier" />
      <PartyForm kind="supplier" action={saveSupplierAction} cancelHref="/purchasing/suppliers" />
    </>
  );
}
