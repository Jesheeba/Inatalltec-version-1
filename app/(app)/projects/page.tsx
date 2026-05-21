import { Suspense } from "react";
import { ProjectsList } from "@/components/modules/Misc";

export default function Page() {
  // ProjectsList reads ?status= via useSearchParams; Next 14 requires
  // a Suspense boundary around any client component that does so.
  return (
    <Suspense fallback={null}>
      <ProjectsList />
    </Suspense>
  );
}
