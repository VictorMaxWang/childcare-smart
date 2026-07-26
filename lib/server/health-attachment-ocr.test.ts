import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  prepareHealthAttachmentOcrPayload,
  stripHealthFileBinaryPayload,
} from "./health-attachment-ocr.ts";

function buildSimplePdf(text: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length + 34} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, "binary");
}

test("health attachment OCR preparation normalizes image bytes to a bounded JPEG", async () => {
  const source = await sharp({
    create: {
      width: 2200,
      height: 1600,
      channels: 3,
      background: { r: 245, g: 248, b: 252 },
    },
  })
    .png()
    .toBuffer();

  const result = await prepareHealthAttachmentOcrPayload({
    bytes: source,
    mimeType: "image/png",
  });

  assert.equal(result.mimeType, "image/jpeg");
  assert.ok(result.imageBase64);
  assert.ok(result.imageBase64.length < 2_000_000);
  assert.equal(result.extractedText, undefined);
});

test("health attachment OCR preparation extracts bounded text from a PDF", async () => {
  const result = await prepareHealthAttachmentOcrPayload({
    bytes: buildSimplePdf("Temperature 38.1 recheck tomorrow"),
    mimeType: "application/pdf",
  });

  assert.equal(result.mimeType, "application/pdf");
  assert.match(result.extractedText ?? "", /Temperature 38\.1 recheck tomorrow/);
  assert.equal(result.imageBase64, undefined);
});

test("health attachment OCR rejects metadata MIME that disagrees with stored bytes", async () => {
  await assert.rejects(
    () =>
      prepareHealthAttachmentOcrPayload({
        bytes: buildSimplePdf("Temperature 38.1"),
        mimeType: "image/png",
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("文件内容与声明类型不一致")
  );
});

test("health attachment OCR preparation rejects a scanned PDF without a text layer", async () => {
  await assert.rejects(
    () =>
      prepareHealthAttachmentOcrPayload({
        bytes: buildSimplePdf(""),
        mimeType: "application/pdf",
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("扫描型 PDF") &&
      error.message.includes("图片")
  );
});

test("health attachment analysis payload strips private binary fields after OCR", () => {
  const result = stripHealthFileBinaryPayload({
    name: "health-note.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 128,
    previewText: "体温 38.1℃",
    imageBase64: "private-image",
    dataUrl: "data:image/jpeg;base64,private-image",
    meta: { imageBase64: "private-image", storageKey: "private/key" },
  });

  assert.equal(result.previewText, "体温 38.1℃");
  assert.equal(result.imageBase64, undefined);
  assert.equal(result.dataUrl, undefined);
  assert.equal(result.meta, undefined);
});
