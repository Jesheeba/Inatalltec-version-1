import { ReplacementDetail } from "@/components/modules/Replacements";
export default function Page({ params }: { params: { id: string } }) {
  return <ReplacementDetail id={params.id} />;
}
