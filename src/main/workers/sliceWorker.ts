import { parentPort } from 'worker_threads';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

interface SliceTask {
  processedBuffer: Buffer;
  imageId: string;
  isAnimated: boolean;
  rows: number;
  columns: number;
  targetSize: number;
  targetDir: string;
  tempDir: string;
  startIndex: number;
  isVideo: boolean;
}

parentPort?.on('message', async (task: SliceTask) => {
  try {
    const { processedBuffer, imageId, isAnimated, rows, columns, targetSize, targetDir, tempDir, startIndex, isVideo } = task;
    
    const sharpOpts = isAnimated ? { animated: true, limitInputPixels: false } : { limitInputPixels: false };
    const fragments: Array<{ buffer: Buffer; fragmentId: string; outputPath: string; row: number; col: number }> = [];
    
    let currentIndex = startIndex;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const fragmentId = `frag_${String(currentIndex).padStart(5, '0')}_r${row}_c${col}`;
        const ext = isVideo && isAnimated ? '.webm' : '.webp';
        const outputPath = path.join(targetDir, `${fragmentId}${ext}`);
        currentIndex++;

        if (isVideo && isAnimated) {
          const tempGifPath = path.join(tempDir, `${fragmentId}_temp.gif`);
          await sharp(processedBuffer, sharpOpts)
            .extract({ left: col * targetSize, top: row * targetSize, width: targetSize, height: targetSize })
            .gif({ quality: 100, effort: 10 })
            .toFile(tempGifPath);
          
          fragments.push({ buffer: Buffer.from(''), fragmentId, outputPath, row, col });
        } else {
          const webpOptions = isAnimated 
            ? { quality: 100, effort: 4, loop: 0 } 
            : { quality: 100, effort: 4, smartSubsample: false, alphaQuality: 100 };
          
          const buffer = await sharp(processedBuffer, sharpOpts)
            .extract({ left: col * targetSize, top: row * targetSize, width: targetSize, height: targetSize })
            .webp(webpOptions)
            .toBuffer();
          
          const optimized = await optimizeWebp(buffer, isAnimated, processedBuffer, sharpOpts, col, row, targetSize);
          await fs.promises.writeFile(outputPath, optimized);
          
          parentPort?.postMessage({ stage: 'fragmentComplete', imageId });
        }
      }
    }

    if (isVideo && isAnimated) {
      parentPort?.postMessage({ success: true, fragments, imageId, needsConversion: true });
    } else {
      parentPort?.postMessage({ success: true, imageId, needsConversion: false });
    }
  } catch (error) {
    parentPort?.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Slicing failed',
      imageId: task.imageId
    });
  }
});

async function optimizeWebp(buffer: Buffer, isAnimated: boolean, processedCanvas: Buffer, sharpOpts: any, col: number, row: number, targetSize: number): Promise<Buffer> {
  let quality = 95;
  let result = buffer;
  
  const targetMaxSize = isAnimated ? 256 * 1024 : 512 * 1024;
  
  while (result.length > targetMaxSize && quality >= 60) {
    result = await sharp(processedCanvas, sharpOpts)
      .extract({ left: col * targetSize, top: row * targetSize, width: targetSize, height: targetSize })
      .webp(isAnimated ? { quality, effort: 4, loop: 0 } : { quality, effort: 4, alphaQuality: quality })
      .toBuffer();
    quality -= 5;
  }
  
  return result;
}
