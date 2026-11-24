import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { getFarmessSession } from "@/lib/auth/session";
import "./admin.css";

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const session = await getFarmessSession();

  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/workspace-unavailable");

  return (
    <WorkspaceLayout
      user={{ displayName: session.displayName, email: session.email, role: session.role }}
    >
      {children}
    </WorkspaceLayout>
  );
}
