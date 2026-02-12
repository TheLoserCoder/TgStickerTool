import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

const { execFile } = require('child_process');
const ffmpegPath = process.env.NODE_ENV === 'development'
  ? require('@ffmpeg-installer/ffmpeg').path
  : path.join(process.cwd(), 'resources', 'ffmpeg-bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

parentPort?.on('message', async (task: { imagePath: string; tempDir: string; imageId: string }) => {
  try {
    const { imagePath, tempDir, imageId } = task;
    
    const buffer = fs.readFileSync(imagePath);
    const isApng = buffer.includes(Buffer.from('acTL'));
    
    if (!isApng) {
      parentPort?.postMessage({ success: true, outputPath: imagePath, imageId });
      return;
    }
    
    const tempWebpPath = path.join(tempDir, `${path.basename(imagePath, path.extname(imagePath))}_apng.webp`);
    
    await new Promise<void>((resolve, reject) => {
      execFile(ffmpegPath, [
        '-i', imagePath,
        '-c:v', 'libwebp_anim',
        '-lossless', '1',
        '-loop', '0',
        '-y',
        tempWebpPath
      ], (error: any) => {
        if (error) reject(error);
        else resolve();
      });
    });
    
    parentPort?.postMessage({ success: true, outputPath: tempWebpPath, imageId });
  } catch (error) {
    parentPort?.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : 'APNG conversion failed',
      imageId: task.imageId
    });
  }
});
