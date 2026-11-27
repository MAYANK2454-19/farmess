import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { getFarmessSession } from "@/lib/auth/session";
import "./admin.css";

export const dynamic = "force-dynamic";

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const session = await getFarmessSession();

  // Anyone who is not a signed-in admin gets the ordinary "page not found",
  // the same answer as for an address that does not exist.
  if (!session || session.role !== "admin") notFound();

  return (
    <WorkspaceLayout
      user={{ displayName: session.displayName, email: session.email, role: session.role }}
    >
      {children}
    </WorkspaceLayout>
  );
}
