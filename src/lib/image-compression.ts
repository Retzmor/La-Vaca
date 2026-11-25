export interface CompressedImageResult {
  base64: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  approximateBytes: number;
}

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.82;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          "No pudimos leer esta imagen. Prueba con una foto JPG, PNG o WebP."
        )
      );
    };
    img.src = objectUrl;
  });
}

/**
 * Comprime y redimensiona una foto de factura directamente en el navegador
 * usando Canvas antes de enviarla a /api/scan-receipt.
 */
export async function compressReceiptImage(
  file: File,
  maxDimension = DEFAULT_MAX_DIMENSION,
  quality = DEFAULT_QUALITY
): Promise<CompressedImageResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo seleccionado no es una imagen válida.");
  }

  const img = await loadImageFromFile(file);
  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;

  if (!originalWidth || !originalHeight) {
    throw new Error("La imagen está dañada o vacía.");
  }

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (originalWidth > maxDimension || originalHeight > maxDimension) {
    const scale = maxDimension / Math.max(originalWidth, originalHeight);
    targetWidth = Math.round(originalWidth * scale);
    targetHeight = Math.round(originalHeight * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Tu navegador no permite procesar imágenes en este momento.");
  }

  // Fondo blanco para PNG transparentes o capturas de pantalla
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const mimeType = "image/jpeg";
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const base64 = dataUrl.split(",")[1] ?? "";

  if (!base64) {
    throw new Error("No se pudo comprimir la foto de la factura.");
  }

  const approximateBytes = Math.round((base64.length * 3) / 4);

  return {
    base64,
    dataUrl,
    mimeType,
    width: targetWidth,
    height: targetHeight,
    approximateBytes,
  };
}
