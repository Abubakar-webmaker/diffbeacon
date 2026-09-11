import { Suspense } from "react";
import CompareWorkspace from "@/components/CompareWorkspace";

export default function Page() {
  return (
    <Suspense>
      <CompareWorkspace />
    </Suspense>
  );
}
