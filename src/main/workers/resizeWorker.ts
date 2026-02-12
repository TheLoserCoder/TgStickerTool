import { parentPort } from 'worker_threads';
import sharp from 'sharp';

interface ResizeTask {
  imageBuffer: Buffer;
  imageId: string;
  isAnimated: boolean;
  totalW: number;
  totalH: number;
  targetSize: number;
  rows: number;
  columns: number;
  upscaleMode: 'soft' | 'sharp' | 'none';
  downscaleMode: 'none' | 'highQuality';
}

parentPort?.on('message', async (task: ResizeTask) => {
  try {
    const { imageBuffer, imageId, isAnimated, totalW, totalH, targetSize, rows, columns, upscaleMode, downscaleMode } = task;
    
    const finalCanvasSize = targetSize * Math.max(rows, columns);
    const sourceSize = Math.max(totalW, totalH);
    const scaleFactor = finalCanvasSize / sourceSize;
    const needsUpscale = sourceSize < finalCanvasSize;
    const needsDownscale = sourceSize > finalCanvasSize;

    let processedCanvas: Buffer;
    const sharpOpts = isAnimated ? { animated: true, limitInputPixels: false } : { limitInputPixels: false };

    if (needsDownscale) {
      if (downscaleMode === 'highQuality') {
        const scaleRatio = sourceSize / finalCanvasSize;
        
        if (scaleRatio >= 3) {
          const intermediateSize = Math.round(finalCanvasSize * 2);
          processedCanvas = await sharp(imageBuffer, sharpOpts)
            .resize(intermediateSize, intermediateSize, { kernel: 'lanczos3', fit: 'inside' })
            .resize(Math.round(totalW * scaleFactor), Math.round(totalH * scaleFactor), { kernel: 'lanczos3', fit: 'inside' })
            .sharpen({ sigma: 0.5 })
            .ensureAlpha()
            .toBuffer();
        } else {
          processedCanvas = await sharp(imageBuffer, sharpOpts)
            .resize(Math.round(totalW * scaleFactor), Math.round(totalH * scaleFactor), { kernel: 'lanczos3', fit: 'inside' })
            .sharpen({ sigma: 0.5 })
            .ensureAlpha()
            .toBuffer();
        }
      } else {
        processedCanvas = await sharp(imageBuffer, sharpOpts)
          .resize(Math.round(totalW * scaleFactor), Math.round(totalH * scaleFactor), { kernel: 'lanczos3', fastShrinkOnLoad: true })
          .ensureAlpha()
          .toBuffer();
      }
    } else if (needsUpscale) {
      if (upscaleMode === 'sharp') {
        processedCanvas = await sharp(imageBuffer, sharpOpts)
          .linear(1.1, -0.05)
          .resize(Math.round(totalW * scaleFactor * 1.1), Math.round(totalH * scaleFactor * 1.1), { kernel: 'mitchell', fastShrinkOnLoad: false })
          .sharpen({ sigma: 1.2, m1: 0.2, m2: 20.0 })
          .resize(Math.round(totalW * scaleFactor), Math.round(totalH * scaleFactor), { kernel: 'mitchell', fastShrinkOnLoad: false })
          .modulate({ saturation: 1.15, brightness: 1.02 })
          .ensureAlpha()
          .toBuffer();
      } else if (upscaleMode === 'soft') {
        processedCanvas = await sharp(imageBuffer, sharpOpts)
          .sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 })
          .resize(Math.round(totalW * scaleFactor), Math.round(totalH * scaleFactor), { kernel: 'lanczos3', fastShrinkOnLoad: false })
          .sharpen({ sigma: 0.8, m1: 1.0, m2: 0.5 })
          .modulate({ saturation: 1.15, brightness: 1.02 })
          .ensureAlpha()
          .toBuffer();
      } else {
        processedCanvas = await sharp(imageBuffer, sharpOpts)
          .resize(Math.round(totalW * scaleFactor), Math.round(totalH * scaleFactor), { kernel: 'lanczos3', fastShrinkOnLoad: false })
          .ensureAlpha()
          .toBuffer();
      }
    } else {
      processedCanvas = imageBuffer;
    }

    parentPort?.postMessage({ success: true, processedBuffer: processedCanvas, imageId });
  } catch (error) {
    parentPort?.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Resize failed',
      imageId: task.imageId
    });
  }
});
