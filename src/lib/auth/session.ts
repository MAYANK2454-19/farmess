import { readFarmessRoleFromAppMetadata, type FarmessRole } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export type FarmessSession = {
  userId: string;
  email: string | null;
  displayName: string;
  role: FarmessRole;
};

export async function getFarmessSession(): Promise<FarmessSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const role = readFarmessRoleFromAppMetadata(user.app_metadata);
  if (!role) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== role) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: profile.display_name?.trim() || user.email?.split("@")[0] || "Farmer",
    role,
  };
}
