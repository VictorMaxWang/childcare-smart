import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    childId?: string;
    taskId?: string;
    date?: string;
  };

  if (!body.childId || !body.taskId || !body.date) {
    return NextResponse.json({ error: "childId/taskId/date are required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceClient();
    const id = `tc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

    const { data, error } = await supabase
      .from("task_checkins")
      .upsert(
        {
          id,
          child_id: body.childId,
          task_id: body.taskId,
          date: body.date,
        },
        { onConflict: "child_id,task_id,date" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ taskCheckin: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "task check-in failed" },
      { status: 500 }
    );
  }
}
