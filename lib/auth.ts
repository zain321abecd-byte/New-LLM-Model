import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";

export interface AuthContext {
  userId: string;
  email: string | null;
  workspace: Workspace;
  role: "owner" | "admin" | "member";
}

/**
 * The signed-in user and their workspace, or null. getUser() re-validates the
 * JWT with Supabase Auth, unlike getSession(), which trusts the cookie.
 * Memoised per request.
 */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role, workspaces(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const workspace = membership?.workspaces as unknown as Workspace | null;
  if (!membership || !workspace) return null;
  return { userId: user.id, email: user.email ?? null, workspace, role: membership.role };
});

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return auth;
}
