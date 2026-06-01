import { SubContractorDetail } from "@/components/modules/SubContractors";
export default function Page({ params }: { params: { id: string } }) {
  return <SubContractorDetail id={params.id} />;
}
