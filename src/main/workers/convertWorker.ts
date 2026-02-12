import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const ffmpegPath = process.env.NODE_ENV === 'development'
  ? require('@ffmpeg-installer/ffmpeg').path
  : path.join(process.cwd(), 'resources', 'ffmpeg-bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

let ffprobePath: string;
try {
  ffprobePath = process.env.NODE_ENV === 'development'
    ? require('@ffprobe-installer/ffprobe').path
    : path.join(process.cwd(), 'resources', 'ffprobe-bin', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
} catch {
  ffprobePath = '';
}

const MAX_SPEED_FACTOR = 2.9;

interface ConvertTask {
  fragments: Array<{ buffer: Buffer; fragmentId: string; outputPath: string; row: number; col: number }>;
  imageId: string;
  tempDir: string;
  targetSize: number;
  compressionMode: 'none' | 'auto';
  imagePath: string;
}

const getDurationFromFfprobe = async (filePath: string): Promise<number> => {
  if (!ffprobePath || !fs.existsSync(ffprobePath)) {
    return 0;
  }
  
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ], { encoding: 'utf8' });
    
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : duration;
  } catch {
    return 0;
  }
};

const getDurationFallback = (stderr: string): number => {
  const match = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
  if (match) {
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
  }
  return 0;
};

const convertFragment = async (frag: any, tempDir: string, targetSize: number, compressionMode: string, limit: number, imageId: string) => {
  const tempGifPath = path.join(tempDir, `${frag.fragmentId}_temp.gif`);
  
  try {
    let duration = await getDurationFromFfprobe(tempGifPath);
    
    if (duration === 0) {
      let stderr = '';
      try {
        const result = await execFileAsync(ffmpegPath, ['-i', tempGifPath, '-f', 'null', '-'], { 
          encoding: 'utf8',
          maxBuffer: 1024 * 1024
        });
        stderr = result.stderr;
      } catch (e: any) {
        stderr = e.stderr || '';
      }
      duration = getDurationFallback(stderr);
    }
    
    if (duration === 0) {
      throw new Error('Unable to determine video duration');
    }
    
    if (compressionMode === 'none' && duration > limit) {
      throw new Error(`Animation duration ${duration.toFixed(1)}s exceeds ${limit}s limit`);
    }
    
    const videoSize = targetSize === 100 ? 100 : 512;
    let speedFactor = 1.0;
    let trimDuration = duration;
    
    if (duration > limit) {
      const idealSpeed = limit / duration;
      
      if (idealSpeed >= (1 / MAX_SPEED_FACTOR)) {
        speedFactor = idealSpeed;
        trimDuration = limit;
      } else {
        speedFactor = 1 / MAX_SPEED_FACTOR;
        trimDuration = limit;
      }
    }
    
    const setptsFilter = speedFactor < 1 ? `setpts=${speedFactor.toFixed(4)}*PTS,` : '';
    const vf = `format=yuva420p,${setptsFilter}fps=30,scale=w=${videoSize}:h=${videoSize}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${videoSize}:${videoSize}:(ow-iw)/2:(oh-ih)/2:color=#00000000`;
    
    const maxSize = 256 * 1024;
    let crf = 32;

    while (crf <= 45) {
      const ffmpegArgs = [
        '-i', tempGifPath,
        '-vf', vf,
        '-t', String(trimDuration),
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuva420p',
        '-crf', String(crf),
        '-b:v', '0',
        '-quality', 'good',
        '-cpu-used', '2',
        '-auto-alt-ref', '0',
        '-an',
        '-y',
        frag.outputPath
      ];
      
      await new Promise<void>((resolve, reject) => {
        execFile(ffmpegPath, ffmpegArgs, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      
      const stats = fs.statSync(frag.outputPath);
      if (stats.size <= maxSize || crf >= 45) break;
      crf += 3;
    }
    
    fs.unlinkSync(tempGifPath);
    parentPort?.postMessage({ stage: 'fragmentComplete', imageId });
  } catch (fragError) {
    if (fs.existsSync(tempGifPath)) fs.unlinkSync(tempGifPath);
    throw fragError;
  }
};

parentPort?.on('message', async (task: ConvertTask) => {
  try {
    const { fragments, imageId, tempDir, targetSize, compressionMode } = task;
    
    const limit = targetSize === 100 ? 9.9 : 2.9;

    await Promise.all(fragments.map(frag => 
      convertFragment(frag, tempDir, targetSize, compressionMode, limit, imageId)
    ));
    
    parentPort?.postMessage({ success: true, imageId });
  } catch (error) {
    parentPort?.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Conversion failed',
      imageId: task.imageId
    });
  }
});
