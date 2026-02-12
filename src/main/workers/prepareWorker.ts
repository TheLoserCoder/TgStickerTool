import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

interface PrepareTask {
  imagePath: string;
  imageId: string;
  rows: number;
  columns: number;
  tempDir: string;
  preserveAnimation: boolean;
}

parentPort?.on('message', async (task: PrepareTask) => {
  try {
    const { imagePath, imageId, rows, columns, tempDir, preserveAnimation } = task;
    
    let processPath = imagePath;
    const isJpeg = /\.(jpe?g)$/i.test(imagePath);
    
    if (isJpeg) {
      const tempPngPath = path.join(tempDir, `${path.basename(imagePath, path.extname(imagePath))}.png`);
      await sharp(imagePath)
        .flatten({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(tempPngPath);
      processPath = tempPngPath;
    }
    
    const sharpInstance = sharp(processPath, { animated: true, limitInputPixels: false });
    const metadata = await sharpInstance.metadata();
    const isAnimated = preserveAnimation && metadata.pages !== undefined && metadata.pages > 1;

    const W = metadata.width!;
    let H = metadata.height!;
    if (isAnimated) H = metadata.pageHeight || H / metadata.pages!;

    const S = Math.max(Math.ceil(W / columns), Math.ceil(H / rows));
    const totalW = S * columns;
    const totalH = S * rows;

    const extendLeft = Math.floor((totalW - W) / 2);
    const extendTop = Math.floor((totalH - H) / 2);
    const extendRight = totalW - W - extendLeft;
    const extendBottom = totalH - H - extendTop;

    const canvas = await sharp(processPath, isAnimated ? { animated: true, limitInputPixels: false } : { limitInputPixels: false })
      .extend({
        top: extendTop,
        bottom: extendBottom,
        left: extendLeft,
        right: extendRight,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .toBuffer();

    parentPort?.postMessage({ 
      success: true, 
      imageBuffer: canvas, 
      imageId,
      isAnimated,
      totalW,
      totalH,
      processPath
    });
  } catch (error) {
    parentPort?.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Prepare failed',
      imageId: task.imageId
    });
  }
});
