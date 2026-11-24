import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getFarmessSession } from "@/lib/auth/session";

export default async function FarmerRoleLayout({ children }: { children: ReactNode }) {
  const session = await getFarmessSession();

  if (!session) redirect("/login");
  if (session.role !== "farmer") redirect("/workspace-unavailable");

  return children;
}
