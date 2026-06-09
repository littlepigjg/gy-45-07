export interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectOptions {
  tolerance: number;
  detectSolidBackground: boolean;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function getPixel(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const idx = (y * width + x) * 4;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
    a: data[idx + 3],
  };
}

function colorDistance(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number }
): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function getCornerColors(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { r: number; g: number; b: number; a: number }[] {
  return [
    getPixel(data, width, 0, 0),
    getPixel(data, width, width - 1, 0),
    getPixel(data, width, 0, height - 1),
    getPixel(data, width, width - 1, height - 1),
  ];
}

function isBackgroundPixel(
  pixel: { r: number; g: number; b: number; a: number },
  bgColor: { r: number; g: number; b: number; a: number },
  tolerance: number
): boolean {
  if (pixel.a <= tolerance) return true;
  if (bgColor.a <= tolerance && pixel.a <= tolerance) return true;
  if (bgColor.a > tolerance && pixel.a > tolerance) {
    const dist = colorDistance(
      { r: pixel.r, g: pixel.g, b: pixel.b },
      { r: bgColor.r, g: bgColor.g, b: bgColor.b }
    );
    return dist <= tolerance;
  }
  return false;
}

export function detectContentBounds(
  canvas: HTMLCanvasElement,
  options: DetectOptions
): CropBounds {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const alphaTolerance = Math.max(0, Math.min(255, Math.round(options.tolerance * 2.55)));
  const colorTolerance = options.tolerance * 2;

  let bgColor = { r: 0, g: 0, b: 0, a: 0 };
  if (options.detectSolidBackground) {
    const corners = getCornerColors(data, width, height);
    let avgR = 0, avgG = 0, avgB = 0, avgA = 0;
    corners.forEach((c) => {
      avgR += c.r;
      avgG += c.g;
      avgB += c.b;
      avgA += c.a;
    });
    bgColor = {
      r: Math.round(avgR / 4),
      g: Math.round(avgG / 4),
      b: Math.round(avgB / 4),
      a: Math.round(avgA / 4),
    };
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let hasContent = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = getPixel(data, width, x, y);
      const isBg = options.detectSolidBackground
        ? isBackgroundPixel(pixel, bgColor, colorTolerance)
        : pixel.a <= alphaTolerance;

      if (!isBg) {
        hasContent = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasContent) {
    return { x: 0, y: 0, width, height };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export async function cropImage(
  dataUrl: string,
  bounds: CropBounds
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const x = Math.max(0, Math.min(bounds.x, img.width - 1));
  const y = Math.max(0, Math.min(bounds.y, img.height - 1));
  const w = Math.max(1, Math.min(bounds.width, img.width - x));
  const h = Math.max(1, Math.min(bounds.height, img.height - y));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = w;
  cropCanvas.height = h;
  const cropCtx = cropCanvas.getContext('2d')!;
  cropCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

  return {
    dataUrl: cropCanvas.toDataURL('image/png'),
    width: w,
    height: h,
  };
}

export async function autoCrop(
  dataUrl: string,
  options: DetectOptions
): Promise<{ dataUrl: string; bounds: CropBounds; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const bounds = detectContentBounds(canvas, options);
  const result = await cropImage(dataUrl, bounds);

  return {
    ...result,
    bounds,
  };
}
