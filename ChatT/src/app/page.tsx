import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check if user has a conversation (is paired)
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .or(`user_1_id.eq.${user.id},user_2_id.eq.${user.id}`)
    .maybeSingle();

  redirect(conversation ? "/chat" : "/pair");
}
