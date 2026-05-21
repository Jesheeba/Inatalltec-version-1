import { CustomerDetail } from "@/components/modules/Customers";
export default function Page({ params }: { params: { id: string } }) {
  return <CustomerDetail id={params.id} />;
}
