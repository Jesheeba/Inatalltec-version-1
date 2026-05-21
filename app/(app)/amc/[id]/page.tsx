import { AmcDetail } from "@/components/modules/Amc";
export default function Page({ params }: { params: { id: string } }) {
  return <AmcDetail id={params.id} />;
}
