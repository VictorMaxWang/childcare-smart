export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("文件读取失败"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

export function clampImageDataUrl(
  imageDataUrl: string,
  maxWidth = 800,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const ratio = image.width > maxWidth ? maxWidth / image.width : 1;
      const targetWidth = Math.max(1, Math.round(image.width * ratio));
      const targetHeight = Math.max(1, Math.round(image.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas 初始化失败"));
        return;
      }
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => reject(new Error("图片解析失败"));
    image.src = imageDataUrl;
  });
}

export function imageDataUrlToFile(dataUrl: string, fileName: string) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/u.exec(dataUrl);
  if (!match) throw new Error("待上传照片格式无效。");
  const binary = window.atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: match[1] });
}
