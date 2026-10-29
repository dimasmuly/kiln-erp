import { PartyForm } from "@/components/party-form";
import { PageHeader } from "@/components/ui/page-header";
import { saveCustomerAction } from "@/server/actions/sales";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "New customer" };
export const instant = false;

export default async function NewCustomerPage() {
  await requireUser("masterdata.write");
  return (
    <>
      <PageHeader crumbs={[{ label: "Customers", href: "/sales/customers" }, { label: "New" }]} title="New customer" />
      <PartyForm kind="customer" action={saveCustomerAction} cancelHref="/sales/customers" />
    </>
  );
}
