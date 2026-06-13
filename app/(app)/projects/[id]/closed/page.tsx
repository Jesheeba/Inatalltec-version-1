import { ClosedPage } from "@/components/modules/closed/Closed";

export default function Page({ params }: { params: { id: string } }) {
  return <ClosedPage projectId={params.id} />;
}
