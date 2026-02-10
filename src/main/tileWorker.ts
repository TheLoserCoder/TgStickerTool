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
}

parentPort?.on('message', async (task: WorkerTask) => {
  try {
    const { canvasBuffer, isAnimated, row, col, targetSize, targetDir, tempDir, globalIndex } = task;
    const columns = Math.floor(Math.sqrt(canvasBuffer.length / (targetSize * targetSize * 4)));
    const fragmentId = `frag_${String(globalIndex).padStart(5, '0')}_r${row}_c${col}`;

    if (isAnimated) {
      const tempGifPath = path.join(tempDir, `${fragmentId}.gif`);
      const outputWebmPath = path.join(targetDir, `${fragmentId}.webm`);

      await sharp(canvasBuffer, { animated: true })
        .extract({
          left: col * targetSize,
          top: row * targetSize,
          width: targetSize,
          height: targetSize,
        })
        .gif({ quality: 100, effort: 10 })
        .toFile(tempGifPath);

      parentPort?.postMessage({ stage: 'sliced', row, col });

      await new Promise<void>((resolve, reject) => {
        ffmpeg(tempGifPath)
          .outputOptions([
            '-c:v libvpx-vp9',
            '-pix_fmt yuva420p',
            '-b:v 0',
            '-crf 15',
            '-quality best',
            '-auto-alt-ref 0',
            '-an',
            '-threads 1',
          ])
          .output(outputWebmPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      fs.unlinkSync(tempGifPath);
    } else {
      const outputWebpPath = path.join(targetDir, `${fragmentId}.webp`);

      await sharp(canvasBuffer)
        .extract({
          left: col * targetSize,
          top: row * targetSize,
          width: targetSize,
          height: targetSize,
        })
        .webp({ quality: 100, effort: 6, smartSubsample: false })
        .toFile(outputWebpPath);

      parentPort?.postMessage({ stage: 'sliced', row, col });
    }

    parentPort?.postMessage({ success: true, row, col });
  } catch (error) {
    parentPort?.postMessage({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
