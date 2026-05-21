import { SiteDetail } from "@/components/modules/Sites";
export default function Page({ params }: { params: { id: string } }) {
  return <SiteDetail id={params.id} />;
}
