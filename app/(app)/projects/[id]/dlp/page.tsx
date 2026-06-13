import { DlpPage } from "@/components/modules/dlp/DLP";

export default function Page({ params }: { params: { id: string } }) {
  return <DlpPage projectId={params.id} />;
}
