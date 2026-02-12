import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';

ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);

interface WorkerTask {
  canvasBuffer: Buffer;
  isAnimated: boolean;
  row: number;
  col: number;
  targetSize: number;
  targetDir: string;
  tempDir: string;
  upscaleMode: 'soft' | 'sharp';
  imageId: string;
  globalIndex: number;
  hardwareEncoder: string | null;
}

parentPort?.on('message', async (task: WorkerTask) => {
  try {
    const { canvasBuffer, isAnimated, row, col, targetSize, targetDir, tempDir, globalIndex, hardwareEncoder } = task;
    
    const metadata = await sharp(canvasBuffer, isAnimated ? { animated: true } : {}).metadata();
    const isActuallyAnimated = isAnimated && metadata.pages !== undefined && metadata.pages > 1;
    
    console.log(`[Worker] Fragment ${globalIndex}: isAnimated=${isAnimated}, format=${metadata.format}, pages=${metadata.pages}, isActuallyAnimated=${isActuallyAnimated}, hardwareEncoder=${hardwareEncoder}`);
    
    const columns = Math.floor(Math.sqrt(canvasBuffer.length / (targetSize * targetSize * 4)));
    const fragmentId = `frag_${String(globalIndex).padStart(5, '0')}_r${row}_c${col}`;

    if (isActuallyAnimated) {
      const outputWebpPath = path.join(targetDir, `${fragmentId}.webp`);

      await sharp(canvasBuffer, { animated: true })
        .extract({
          left: col * targetSize,
          top: row * targetSize,
          width: targetSize,
          height: targetSize,
        })
        .webp({ quality: 100, effort: 6, loop: 0 })
        .toFile(outputWebpPath);

      parentPort?.postMessage({ stage: 'sliced', row, col });
    } else {
      const outputWebpPath = path.join(targetDir, `${fragmentId}.webp`);

      await sharp(canvasBuffer)
        .extract({
          left: col * targetSize,
          top: row * targetSize,
          width: targetSize,
          height: targetSize,
        })
        .ensureAlpha()
        .webp({ quality: 100, effort: 6, smartSubsample: false, alphaQuality: 100 })
        .toFile(outputWebpPath);

      parentPort?.postMessage({ stage: 'sliced', row, col });
    }

    parentPort?.postMessage({ success: true, row, col });
  } catch (error) {
    console.error(`[Worker] Error processing fragment:`, error);
    parentPort?.postMessage({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
