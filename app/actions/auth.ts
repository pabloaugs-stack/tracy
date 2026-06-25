"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRedirectPath } from "@/lib/auth/roles";

export type AuthState = { error: string } | undefined;

export async function signIn(
  prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get("email") as string).trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Preencha todos os campos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email ou senha incorretos." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Erro ao obter sessão." };

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  redirect(profile ? getRedirectPath(profile.role) : "/admin");
}

export async function signUp(
  prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get("email") as string).trim();
  const password = formData.get("password") as string;
  const fullName = (formData.get("full_name") as string).trim();
  const salonName = (formData.get("salon_name") as string).trim();

  if (!email || !password || !fullName || !salonName) {
    return { error: "Preencha todos os campos." };
  }

  if (password.length < 6) {
    return { error: "A senha deve ter pelo menos 6 caracteres." };
  }

  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Erro ao criar conta." };
  }

  // Usa admin client para criar salão e perfil — novo usuário não tem salon_id,
  // então as políticas RLS bloqueariam o insert com o cliente normal.
  const admin = createAdminClient();

  // Guard: verifica se já existe perfil para este id (ex: usuário convidado como profissional).
  // Nesse caso, não criar novo salão — apenas redirecionar para o dashboard do papel já vinculado.
  const { data: existingProfile } = await admin
    .from("users")
    .select("role, salon_id")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (existingProfile) {
    redirect(getRedirectPath(existingProfile.role));
  }

  const { data: salon, error: salonError } = await admin
    .from("salons")
    .insert({ name: salonName })
    .select("id")
    .single();

  if (salonError || !salon) {
    return { error: salonError?.message ?? "Erro ao criar salão." };
  }

  // email não é inserido aqui — já vive em auth.users.
  // Se a sua tabela users tiver uma coluna email NOT NULL sem default,
  // adicione: email, ao objeto abaixo e ajuste UserInsert em database.ts.
  const { error: profileError } = await admin.from("users").insert({
    id: authData.user.id,
    email,
    name: fullName,
    role: "dono",
    salon_id: salon.id,
  });

  if (profileError) {
    return { error: profileError.message };
  }

  redirect("/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function setPasswordAction(
  prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = (formData.get("password") as string | null) ?? ""
  const confirm = (formData.get("password_confirm") as string | null) ?? ""

  if (password.length < 6) return { error: "A senha deve ter pelo menos 6 caracteres." }
  if (password !== confirm) return { error: "As senhas não coincidem." }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  // Lê role do perfil para redirecionar para o dashboard correto
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  redirect(profile ? getRedirectPath(profile.role) : "/admin")
}
