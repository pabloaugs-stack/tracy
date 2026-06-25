import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRedirectPath } from "@/lib/auth/roles";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  redirect(profile ? getRedirectPath(profile.role) : "/admin");
}
