import { HandoverPage } from "@/components/modules/handover/Handover";

export default function Page({ params }: { params: { id: string } }) {
  return <HandoverPage projectId={params.id} />;
}
