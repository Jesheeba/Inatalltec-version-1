import { InstallationPage } from "@/components/modules/install/Installation";

export default function Page({ params }: { params: { id: string } }) {
  return <InstallationPage projectId={params.id} />;
}
