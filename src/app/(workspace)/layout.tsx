import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { getFarmessSession } from "@/lib/auth/session";

export default async function WorkspaceRootLayout({ children }: { children: ReactNode }) {
  const session = await getFarmessSession();

  if (!session) redirect("/login");
  // Admin workflows are intentionally not exposed through the operator workspace.
  if (session.role === "admin") redirect("/workspace-unavailable");

  return (
    <WorkspaceLayout
      user={{
        displayName: session.displayName,
        email: session.email,
        role: session.role,
      }}
    >
      {children}
    </WorkspaceLayout>
  );
}
