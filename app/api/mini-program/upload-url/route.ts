import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    fileName?: string;
    contentType?: string;
    childId?: string;
    uploadedBy?: string;
  };

  if (!body.fileName || !body.contentType) {
    return NextResponse.json({ error: "fileName and contentType are required" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceClient();
    const objectPath = `${new Date().toISOString().split("T")[0]}/${Date.now()}-${body.fileName}`;

    const { data: signed, error: signedError } = await supabase.storage
      .from("parent-media")
      .createSignedUploadUrl(objectPath);

    if (signedError) {
      return NextResponse.json({ error: signedError.message }, { status: 500 });
    }

    const { error: assetError } = await supabase.from("file_assets").insert({
      child_id: body.childId ?? null,
      uploaded_by: body.uploadedBy ?? null,
      bucket: "parent-media",
      object_path: objectPath,
      mime_type: body.contentType,
    });

    if (assetError) {
      return NextResponse.json({ error: assetError.message }, { status: 500 });
    }

    return NextResponse.json({
      token: signed.token,
      path: objectPath,
      uploadUrl: signed.signedUrl,
      bucket: "parent-media",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "create upload url failed" },
      { status: 500 }
    );
  }
}
