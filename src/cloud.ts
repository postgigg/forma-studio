import { createClient } from "@supabase/supabase-js";
import { validateDesign } from "./storage";
import type { Design } from "./types";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = !window.formaDesktop && url && key ? createClient(url, key) : null;
export async function cloudSave(design: Design) {
  if (!supabase)
    throw new Error("Account storage is not configured for this installation.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save to your account.");
  const { error } = await supabase.from("designs").upsert(
    {
      id: design.id,
      owner_id: user.id,
      name: design.name,
      document: design,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}
export async function cloudDesigns(): Promise<Design[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("designs")
    .select("document")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => {
    validateDesign(row.document);
    return row.document;
  });
}
export async function cloudDelete(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from("designs").delete().eq("id", id);
  if (error) throw error;
}
