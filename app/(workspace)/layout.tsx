import { pageWorkspace } from "@/lib/data";
import { readiness } from "@/lib/readiness";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { Shell } from "@/components/shell";
import { Setup } from "@/components/setup";
import { Suspense } from "react";
import Loading from "./loading";
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <WorkspaceContent>{children}</WorkspaceContent>
    </Suspense>
  );
}
async function WorkspaceContent({ children }: { children: React.ReactNode }) {
  const { workspace, error } = await pageWorkspace();
  if (!workspace)
    return (
      <Shell standalone>
        <Setup checks={readiness()} error={error} />
      </Shell>
    );
  return (
    <WorkspaceProvider initial={workspace}>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
