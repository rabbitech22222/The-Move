import { requireSessionPage } from "@/lib/auth";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { Shell } from "@/components/shell";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const operator = await requireSessionPage();
  return (
    <WorkspaceProvider>
      <Shell operator={operator}>{children}</Shell>
    </WorkspaceProvider>
  );
}
