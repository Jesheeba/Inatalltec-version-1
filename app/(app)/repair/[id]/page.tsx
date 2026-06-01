import { RepairDetail } from "@/components/modules/Misc";
export default function Page({ params }: { params: { id: string } }) {
  return <RepairDetail id={params.id} />;
}
