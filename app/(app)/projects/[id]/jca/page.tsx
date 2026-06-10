import { JcaPage } from "@/components/modules/design/Jca";

export default function Page({ params }: { params: { id: string } }) {
  return <JcaPage projectId={params.id} />;
}
