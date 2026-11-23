import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getFarmessSession } from "@/lib/auth/session";

export default async function BuyerRoleLayout({ children }: { children: ReactNode }) {
  const session = await getFarmessSession();

  if (!session) redirect("/login");
  if (session.role !== "buyer") redirect("/workspace-unavailable");

  return children;
}
