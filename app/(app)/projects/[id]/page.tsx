import { ProjectDetail } from "@/components/modules/Misc";
export default function Page({ params }: { params: { id: string } }) {
  return <ProjectDetail id={params.id} />;
}
