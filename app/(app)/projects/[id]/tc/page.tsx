import { TcPage } from "@/components/modules/tc/TC";

export default function Page({ params }: { params: { id: string } }) {
  return <TcPage projectId={params.id} />;
}
