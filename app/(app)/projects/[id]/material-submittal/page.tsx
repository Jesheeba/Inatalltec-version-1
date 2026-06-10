import { MaterialSubmittalPage } from "@/components/modules/design/MaterialSubmittal";

export default function Page({ params }: { params: { id: string } }) {
  return <MaterialSubmittalPage projectId={params.id} />;
}
