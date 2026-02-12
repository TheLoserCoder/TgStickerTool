import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { Worker } from 'worker_threads';

interface ProcessTask {
  images: Array<{
    id: string;
    path: string;
    rows: number;
    columns: number;
  }>;
  targetSize: number;
  targetDir: string;
  tempDir: string;
  upscaleMode: 'soft' | 'sharp' | 'none';
  downscaleMode: 'none' | 'highQuality';
  preserveAnimation: boolean;
  startIndex: number;
  isVideo?: boolean;
  compressionMode?: 'none' | 'auto';
}

sharp.cache({ items: 100, memory: 200 * 1024 * 1024 });
sharp.concurrency(4);

parentPort?.on('message', async (task: ProcessTask) => {
  try {
    const { images, targetSize, targetDir, tempDir, upscaleMode, downscaleMode, preserveAnimation, startIndex, isVideo, compressionMode = 'auto' } = task;
    
    let currentIndex = startIndex;

    for (const img of images) {
      try {
        let processPath = img.path;
        const isPng = /\.png$/i.test(processPath);
        
        if (isPng && preserveAnimation) {
          processPath = await processApng(processPath, tempDir, img.id);
        }
        
        const prepared = await processPrepare(processPath, img.id, img.rows, img.columns, tempDir, preserveAnimation);
        
        const processedCanvas = await processResize(
          prepared.imageBuffer, 
          prepared.isAnimated, 
          prepared.totalW, 
          prepared.totalH, 
          targetSize, 
          img.rows, 
          img.columns, 
          upscaleMode, 
          downscaleMode, 
          img.id
        );
        
        await processSlicing(
          processedCanvas, 
          img.id, 
          prepared.isAnimated, 
          img.rows, 
          img.columns, 
          targetSize, 
          targetDir, 
          tempDir, 
          currentIndex, 
          isVideo || false, 
          compressionMode, 
          prepared.processPath
        );
        
        currentIndex += img.rows * img.columns;
      } catch (error) {
        console.error(`[ImageWorker] Error processing image ${img.id}:`, error);
        parentPort?.postMessage({ 
          stage: 'skip', 
          imageId: img.id, 
          reason: error instanceof Error ? error.message : 'Processing failed' 
        });
        continue;
      }
    }
    
    parentPort?.postMessage({ stage: 'allComplete' });
  } catch (error) {
    console.error(`[ProcessWorker] Error:`, error);
    parentPort?.postMessage({
      stage: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function processPrepare(imagePath: string, imageId: string, rows: number, columns: number, tempDir: string, preserveAnimation: boolean): Promise<any> {
  const workerPath = path.join(__dirname, 'workers', 'prepareWorker.js');
  const worker = new Worker(workerPath);
  
  return new Promise((resolve, reject) => {
    worker.on('message', (result) => {
      worker.terminate();
      if (result.success) {
        parentPort?.postMessage({ stage: 'fragmentComplete', imageId });
        resolve(result);
      } else {
        reject(new Error(result.error));
      }
    });
    
    worker.on('error', (err) => {
      worker.terminate();
      reject(err);
    });
    
    worker.postMessage({ imagePath, imageId, rows, columns, tempDir, preserveAnimation });
  });
}

async function processApng(imagePath: string, tempDir: string, imageId: string): Promise<string> {
  const workerPath = path.join(__dirname, 'workers', 'apngWorker.js');
  const worker = new Worker(workerPath);
  
  return new Promise((resolve, reject) => {
    worker.on('message', (result) => {
      worker.terminate();
      if (result.success) {
        parentPort?.postMessage({ stage: 'fragmentComplete', imageId });
        resolve(result.outputPath);
      } else {
        reject(new Error(result.error));
      }
    });
    
    worker.on('error', (err) => {
      worker.terminate();
      reject(err);
    });
    
    worker.postMessage({ imagePath, tempDir, imageId });
  });
}

async function processResize(imageBuffer: Buffer, isAnimated: boolean, totalW: number, totalH: number, targetSize: number, rows: number, columns: number, upscaleMode: string, downscaleMode: string, imageId: string): Promise<Buffer> {
  const workerPath = path.join(__dirname, 'workers', 'resizeWorker.js');
  const worker = new Worker(workerPath);
  
  return new Promise((resolve, reject) => {
    worker.on('message', (result) => {
      worker.terminate();
      if (result.success) {
        parentPort?.postMessage({ stage: 'fragmentComplete', imageId });
        resolve(result.processedBuffer);
      } else {
        reject(new Error(result.error));
      }
    });
    
    worker.on('error', (err) => {
      worker.terminate();
      reject(err);
    });
    
    worker.postMessage({ imageBuffer, imageId, isAnimated, totalW, totalH, targetSize, rows, columns, upscaleMode, downscaleMode });
  });
}

async function processSlicing(processedBuffer: Buffer, imageId: string, isAnimated: boolean, rows: number, columns: number, targetSize: number, targetDir: string, tempDir: string, startIndex: number, isVideo: boolean, compressionMode: string, imagePath: string): Promise<void> {
  const workerPath = path.join(__dirname, 'workers', 'sliceWorker.js');
  const worker = new Worker(workerPath);
  
  return new Promise((resolve, reject) => {
    worker.on('message', async (result) => {
      if (result.stage === 'fragmentComplete') {
        parentPort?.postMessage({ stage: 'fragmentComplete', imageId });
      } else if (result.success) {
        worker.terminate();
        
        if (result.needsConversion) {
          await processConversion(result.fragments, imageId, tempDir, targetSize, compressionMode, imagePath);
        }
        
        resolve();
      } else {
        worker.terminate();
        reject(new Error(result.error));
      }
    });
    
    worker.on('error', (err) => {
      worker.terminate();
      reject(err);
    });
    
    worker.postMessage({ processedBuffer, imageId, isAnimated, rows, columns, targetSize, targetDir, tempDir, startIndex, isVideo });
  });
}

async function processConversion(fragments: any[], imageId: string, tempDir: string, targetSize: number, compressionMode: string, imagePath: string): Promise<void> {
  const workerPath = path.join(__dirname, 'workers', 'convertWorker.js');
  const worker = new Worker(workerPath);
  
  return new Promise((resolve, reject) => {
    worker.on('message', (result) => {
      if (result.stage === 'fragmentComplete') {
        parentPort?.postMessage({ stage: 'fragmentComplete', imageId });
      } else if (result.success) {
        worker.terminate();
        resolve();
      } else {
        worker.terminate();
        reject(new Error(result.error));
      }
    });
    
    worker.on('error', (err) => {
      worker.terminate();
      reject(err);
    });
    
    worker.postMessage({ fragments, imageId, tempDir, targetSize, compressionMode, imagePath });
  });
}
