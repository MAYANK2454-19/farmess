import { redirect } from "next/navigation";
import { getFarmessSession } from "@/lib/auth/session";

export default async function HomePage() {
  const session = await getFarmessSession();

  if (!session) redirect("/login");

  if (session.role === "buyer") redirect("/buyer");
  if (session.role === "operator") redirect("/operator");
  if (session.role === "admin") redirect("/workspace-unavailable");

  redirect("/farmer");
}
