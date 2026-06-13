import { MaterialSupplyPage } from "@/components/modules/supply/MaterialSupply";

export default function Page({ params }: { params: { id: string } }) {
  return <MaterialSupplyPage projectId={params.id} />;
}
