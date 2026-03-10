import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const childId = searchParams.get("childId");

  if (!childId) {
    return NextResponse.json({ error: "childId is required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceClient();

    const [{ data: child }, { data: meals }, { data: growth }, { data: feedbacks }] = await Promise.all([
      supabase.from("children").select("*").eq("id", childId).single(),
      supabase.from("meal_records").select("*").eq("child_id", childId).order("date", { ascending: false }).limit(10),
      supabase.from("growth_records").select("*").eq("child_id", childId).order("created_at", { ascending: false }).limit(10),
      supabase.from("guardian_feedbacks").select("*").eq("child_id", childId).order("created_at", { ascending: false }).limit(10),
    ]);

    return NextResponse.json({ child, meals: meals ?? [], growth: growth ?? [], feedbacks: feedbacks ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch parent feed failed" },
      { status: 500 }
    );
  }
}
