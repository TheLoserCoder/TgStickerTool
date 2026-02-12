import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Worker } from 'worker_threads';
import sharp from 'sharp';
import uniqueid from 'uniqueid';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { IPC_CHANNELS, SlicingParams, SlicingResult, ProgressData, TelegramPackParams, TelegramPackResult, LocalPack, FragmentManifest } from '../common/types';
import { TelegramBotClient } from './services/TelegramBotClient';
import { ManifestService } from './services/ManifestService';
import { SyncResult } from './services/IStickerProvider';
import { isAnimatedImage } from './utils/imageDetector';

import Store from 'electron-store';
const store = new Store();

let hardwareEncoder: string | null = null;

async function calculateTotalSteps(images: any[], preserveAnimation: boolean, tempDir: string): Promise<number> {
  let steps = 0;
  
  for (const img of images) {
    const isPng = /\.png$/i.test(img.path);
    if (isPng && preserveAnimation) {
      const buffer = fs.readFileSync(img.path);
      const isApng = buffer.includes(Buffer.from('acTL'));
      if (isApng) steps++; // apngWorker
    }
    
    steps++; // prepareWorker
    steps++; // resizeWorker
    
    const metadata = await sharp(img.path, { animated: true, limitInputPixels: false }).metadata();
    const isAnimated = preserveAnimation && metadata.pages !== undefined && metadata.pages > 1;
    
    const fragmentCount = img.rows * img.columns;
    steps += fragmentCount; // sliceWorker (по одному на фрагмент)
    
    if (isAnimated) {
      steps += fragmentCount; // convertWorker (по одному на фрагмент)
    }
  }
  
  return steps;
}

protocol.registerSchemesAsPrivileged([
  { 
    scheme: 'gif-file', 
    privileges: { 
      standard: true, 
      secure: true, 
      supportFetchAPI: true, 
      bypassCSP: true
    } 
  }
]);

let mainWindow: BrowserWindow | null = null;
let botClient: TelegramBotClient | null = null;

function detectHardwareEncoder(): string | null {
  try {
    const { execSync } = require('child_process');
    const ffmpegPath = process.env.NODE_ENV === 'development'
      ? require('@ffmpeg-installer/ffmpeg').path
      : path.join(process.resourcesPath, 'ffmpeg-bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    
    const output = execSync(`"${ffmpegPath}" -encoders`, { encoding: 'utf8' });
    
    if (output.includes('vp9_nvenc')) return 'vp9_nvenc';
    if (output.includes('vp9_vaapi')) return 'vp9_vaapi';
    if (output.includes('vp9_qsv')) return 'vp9_qsv';
    if (output.includes('vp9_amf')) return 'vp9_amf';
    
    return null;
  } catch (error) {
    console.error('[Main] Failed to detect hardware encoder:', error);
    return null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  store.set('userDataPath', app.getPath('userData'));
  
  hardwareEncoder = detectHardwareEncoder();
  if (hardwareEncoder) {
    console.log('[Main] Hardware encoder detected:', hardwareEncoder);
  } else {
    console.log('[Main] No hardware encoder found, using software encoding');
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle(IPC_CHANNELS.SELECT_FILES, async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'PNG', 'JPG', 'JPEG', 'WEBP', 'GIF'] },
      { name: 'All Files', extensions: ['*'] }
    ],
  });
  return result.canceled ? null : result.filePaths;
});

ipcMain.handle(IPC_CHANNELS.READ_IMAGE, async (_, filePath: string) => {
  if (!filePath) return '';
  const buffer = fs.readFileSync(filePath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
});

ipcMain.handle(IPC_CHANNELS.SELECT_DIRECTORY, async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle(IPC_CHANNELS.STORE_GET, async (_, key: string) => {
  return store.get(key);
});

ipcMain.handle(IPC_CHANNELS.STORE_SET, async (_, key: string, value: any) => {
  store.set(key, value);
});

ipcMain.handle(IPC_CHANNELS.SAVE_PACK, async (_, packId: string, packDir: string, originalImagePath: string, packData: any) => {
  try {
    fs.mkdirSync(packDir, { recursive: true });
    
    const metaPath = path.join(packDir, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(packData, null, 2));
    
    const fragmentsDir = path.join(packDir, 'fragments');
    const files = fs.readdirSync(fragmentsDir)
      .filter(f => f.endsWith('.webp') || f.endsWith('.webm'))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/frag_(\d+)/)?.[1] || '0');
        const bNum = parseInt(b.match(/frag_(\d+)/)?.[1] || '0');
        return aNum - bNum;
      });
    
    if (files.length > 0) {
      const firstFragment = path.join(fragmentsDir, files[0]);
      const previewPath = path.join(packDir, 'preview.webp');
      
      await sharp(firstFragment)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 })
        .toFile(previewPath);
    }
    
    const manifestService = new ManifestService(packDir);
    manifestService.initFragments(files, '😀');
    console.log('[Main] Created manifest for local pack with', files.length, 'fragments');
  } catch (error) {
    console.error('Error saving pack:', error);
  }
});

ipcMain.handle(IPC_CHANNELS.DELETE_PACK, async (_, packId: string, packDir: string) => {
  try {
    if (packDir && fs.existsSync(packDir)) {
      fs.rmSync(packDir, { recursive: true, force: true });
      console.log('[Main] Deleted pack directory:', packDir);
    }
  } catch (error) {
    console.error('Error deleting pack:', error);
    throw error;
  }
});

ipcMain.handle(IPC_CHANNELS.DELETE_FRAGMENT, async (_, filePath: string, packDir?: string) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('Файл не найден');
    }

    const fileName = path.basename(filePath);
    
    // Если передан packDir, проверяем manifest
    if (packDir) {
      const manifestService = new ManifestService(packDir);
      const manifest = manifestService.load();
      const frag = manifest.fragments.find(f => f.fileName === fileName);
      
      // Если стикер загружен в Telegram, проверяем можно ли удалить
      if (frag?.status === 'uploaded') {
        if (!manifestService.canDelete()) {
          throw new Error('В паке должен остаться хотя бы один стикер');
        }
        
        // Удаляем из Telegram если есть fileId
        if (frag.fileId) {
          const metaPath = path.join(packDir, 'meta.json');
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          const localPacks = (await store.get('localPacks')) || [];
          const pack = localPacks.find((p: LocalPack) => p.id === meta.id);
          
          if (pack?.tgBotId) {
            const bots = (await store.get('bots')) || [];
            const bot = bots.find((b: any) => b.id === pack.tgBotId);
            
            if (bot) {
              const botClient = new TelegramBotClient(bot.token);
              const result = await botClient.deleteStickerFromSet(frag.fileId);
              
              if (!result.success) {
                if (result.error === 'STICKERSET_NOT_MODIFIED') {
                  throw new Error('Не удалось удалить: в наборе должен остаться хотя бы один элемент');
                }
                throw new Error(result.error || 'Ошибка удаления из Telegram');
              }
            }
          }
        }
        
        manifestService.removeFragment(fileName);
      }
    }
    
    fs.unlinkSync(filePath);
    console.log('[Main] Deleted fragment:', filePath);
  } catch (error) {
    console.error('Error deleting fragment:', error);
    throw error;
  }
});

ipcMain.handle(IPC_CHANNELS.OPEN_FOLDER, async (_, folderPath: string) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) return;
    const { shell } = require('electron');
    await shell.openPath(folderPath);
  } catch (error) {
    console.error('Error opening folder:', error);
  }
});

ipcMain.handle(IPC_CHANNELS.GET_FRAGMENTS, async (_, fragmentsDir: string) => {
  try {
    if (!fragmentsDir || !fs.existsSync(fragmentsDir)) {
      console.log('Fragments dir not found:', fragmentsDir);
      return [];
    }
    
    const packDir = path.dirname(fragmentsDir);
    const manifestService = new ManifestService(packDir);
    const manifest = manifestService.load();
    
    const files = manifest.order.filter(fileName => {
      const filePath = path.join(fragmentsDir, fileName);
      return fs.existsSync(filePath);
    });
    
    const fullPaths = files.map(f => path.join(fragmentsDir, f));
    console.log('Found fragments from manifest order:', fullPaths.length);
    return fullPaths;
  } catch (error) {
    console.error('Error getting fragments:', error);
    return [];
  }
});

ipcMain.handle(IPC_CHANNELS.GET_GIFS, async () => {
  try {
    const isDev = process.env.NODE_ENV === 'development';
    const gifsDir = isDev 
      ? path.join(__dirname, '../../public/gifs')
      : path.join(process.resourcesPath, 'public/gifs');
    
    if (!fs.existsSync(gifsDir)) {
      console.log('Gifs directory not found:', gifsDir);
      return [];
    }
    
    const files = fs.readdirSync(gifsDir)
      .filter(f => f.toLowerCase().endsWith('.gif'))
      .map(f => {
        const filePath = path.join(gifsDir, f);
        const buffer = fs.readFileSync(filePath);
        return `data:image/gif;base64,${buffer.toString('base64')}`;
      });
    
    return files;
  } catch (error) {
    console.error('Error getting gifs:', error);
    return [];
  }
});

ipcMain.handle(IPC_CHANNELS.GET_MANIFEST, async (_, packDir: string) => {
  try {
    const manifestPath = path.join(packDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return null;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return manifest;
  } catch (error) {
    console.error('Error reading manifest:', error);
    return null;
  }
});

ipcMain.handle(IPC_CHANNELS.SYNC_PACK, async (_, packDir: string, botToken: string) => {
  try {
    const manifestService = new ManifestService(packDir);
    const manifest = manifestService.load();
    
    if (!manifest.packName) {
      return { success: false, error: 'Пак еще не загружен в Telegram' };
    }

    const fragmentsDir = path.join(packDir, 'fragments');
    
    // Удаляем из manifest записи о файлах которых нет на диске
    manifest.fragments = manifest.fragments.filter((f: any) => {
      const filePath = path.join(fragmentsDir, f.fileName);
      return fs.existsSync(filePath);
    });

    botClient = new TelegramBotClient(botToken);
    const syncResult = await botClient.syncPackWithTelegram(manifest.packName, manifest);
    
    if (!syncResult.success) {
      return syncResult;
    }

    manifest.fragments = syncResult.updatedFragments;
    
    if (syncResult.missingInLocal && syncResult.missingInLocal.length > 0) {
      console.log('[Main] Downloading', syncResult.missingInLocal.length, 'missing stickers from TG');
      
      for (let i = 0; i < syncResult.missingInLocal.length; i++) {
        const missing = syncResult.missingInLocal[i];
        const ext = missing.isVideo ? '.webm' : '.webp';
        const fileName = `sync_frag_${String(manifest.fragments.length + i).padStart(5, '0')}${ext}`;
        const filePath = path.join(fragmentsDir, fileName);
        
        const downloaded = await botClient.downloadSticker(missing.fileId, filePath);
        
        if (downloaded) {
          manifest.fragments.push({
            fileName,
            status: 'uploaded',
            fileId: missing.fileId,
            emoji: missing.emoji
          });
          console.log('[Main] Downloaded:', fileName);
        }
      }
    }
    
    const stickerSet = await botClient.getStickerSet(manifest.packName);
    if (stickerSet?.stickers) {
      const tgOrder = stickerSet.stickers.map((s: any) => {
        const frag = manifest.fragments.find(f => f.fileId === s.file_id);
        return frag?.fileName;
      }).filter(Boolean) as string[];
      
      if (tgOrder.length > 0) {
        manifest.order = tgOrder;
      }
    }
    
    manifestService.save(manifest);
    return { success: true, downloaded: syncResult.missingInLocal?.length || 0 };
  } catch (error) {
    console.error('Error syncing pack:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
});

ipcMain.handle(IPC_CHANNELS.UPDATE_FRAGMENT_ORDER, async (_, packDir: string, order: string[]) => {
  try {
    const manifestService = new ManifestService(packDir);
    manifestService.updateOrder(order);
    console.log('[Main] Updated fragment order:', order.length, 'items');
  } catch (error) {
    console.error('Error updating fragment order:', error);
    throw error;
  }
});

ipcMain.handle(IPC_CHANNELS.UPDATE_MANIFEST, async (_, packDir: string) => {
  try {
    const fragmentsDir = path.join(packDir, 'fragments');
    const files = fs.readdirSync(fragmentsDir)
      .filter(f => f.endsWith('.webp') || f.endsWith('.webm'))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/frag_(\d+)/)?.[1] || '0');
        const bNum = parseInt(b.match(/frag_(\d+)/)?.[1] || '0');
        return aNum - bNum;
      });
    
    const manifestService = new ManifestService(packDir);
    manifestService.initFragments(files, '😀');
    console.log('[Main] Updated manifest with', files.length, 'fragments');
  } catch (error) {
    console.error('Error updating manifest:', error);
    throw error;
  }
});

ipcMain.handle(IPC_CHANNELS.REORDER_STICKERS, async (event, packDir: string, botToken: string, desiredOrder: string[]) => {
  try {
    console.log('[Main] REORDER_STICKERS called');
    console.log('[Main] Desired order:', desiredOrder);
    
    const manifestService = new ManifestService(packDir);
    const manifest = manifestService.load();
    
    console.log('[Main] Manifest fragments:', manifest.fragments.map(f => ({ fileName: f.fileName, fileId: f.fileId, status: f.status })));
    
    if (!manifest.packName) {
      return { success: false, error: 'Пак еще не загружен в Telegram' };
    }
    
    if (!desiredOrder || desiredOrder.length === 0) {
      console.log('[Main] No desired order provided');
      return { success: true, moved: 0 };
    }
    
    const fragmentMap = new Map(manifest.fragments.map(f => [f.fileName, f]));
    const fileIds = desiredOrder
      .map(fileName => fragmentMap.get(fileName))
      .filter(f => f && f.fileId && f.status === 'uploaded')
      .map(f => f!.fileId!);
    
    console.log('[Main] File IDs to reorder:', fileIds);
    
    if (fileIds.length === 0) {
      console.log('[Main] No uploaded stickers to reorder');
      return { success: true, moved: 0 };
    }
    
    botClient = new TelegramBotClient(botToken);
    const result = await botClient.reorderStickers(manifest.packName, fileIds, (current, total) => {
      const percent = Math.round((current / total) * 100);
      event.sender.send(IPC_CHANNELS.TELEGRAM_UPLOAD_PROGRESS, {
        current,
        total,
        percent,
        stage: 'uploading',
        message: `Синхронизация порядка: ${current} из ${total}`,
      });
    });
    
    console.log('[Main] Reorder result from TelegramBot:', result);
    
    if (result.success) {
      const manifest = manifestService.load();
      manifest.order = desiredOrder;
      manifest.pendingReorder = false;
      manifestService.save(manifest);
      console.log('[Main] Updated manifest order and cleared pendingReorder flag');
    }
    
    return result;
  } catch (error) {
    console.error('[Main] Error reordering stickers:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
});

ipcMain.handle(IPC_CHANNELS.IMPORT_LINE_STICKERS, async (event, url: string) => {
  try {
    const https = require('https');
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.get(url, { httpsAgent });
    const $ = cheerio.load(response.data);
    const images: string[] = [];

    $('li.mdCMN09Li').each((_, element) => {
      const dataPreview = $(element).attr('data-preview');
      if (dataPreview) {
        try {
          const previewData = JSON.parse(dataPreview);
          const isAnimation = previewData.type === 'animation';
          const template = isAnimation ? 'sticker_animation@2x.png' : 'sticker@2x.png';
          
          if (previewData.staticUrl) {
            const baseUrl = previewData.staticUrl.substring(0, previewData.staticUrl.lastIndexOf('/'));
            const stickerUrl = `${baseUrl}/${template}`;
            images.push(stickerUrl);
          }
        } catch (e) {
          console.error('[Main] Failed to parse data-preview:', e);
        }
      }
    });

    if (images.length === 0) {
      return { success: false, error: 'Стикеры не найдены на странице' };
    }

    const tempDir = path.join(os.tmpdir(), `line_import_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const filePaths: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i];
      try {
        event.sender.send('line-import-progress', { current: i + 1, total: images.length });
        
        const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', httpsAgent });
        const tempFilePath = path.join(tempDir, `sticker_${i}.png`);
        fs.writeFileSync(tempFilePath, Buffer.from(imgResponse.data));
        filePaths.push(tempFilePath);
      } catch (e) {
        console.error('[Main] Failed to download image:', imageUrl, e);
      }
    }

    return { success: true, filePaths, tempDir };
  } catch (error) {
    console.error('[Main] Error importing LINE stickers:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Ошибка загрузки' };
  }
});

ipcMain.handle(IPC_CHANNELS.PROCESS_SLICING, async (event, params: SlicingParams): Promise<SlicingResult> => {
  try {
    const { images, targetDir, outputFormat, upscaleMode, downscaleMode, preserveAnimation, performanceMode, startIndex = 0, isVideo = preserveAnimation } = params;
    
    fs.mkdirSync(targetDir, { recursive: true });
    
    const tempDir = path.join(os.tmpdir(), `slicing-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const targetSize = outputFormat === 'STICKER' ? 512 : 100;
    let upscaled = 0;
    let converted = 0;
    
    console.log(`[Main] Performance mode: ${performanceMode}, processing sequentially`);

    const totalSteps = await calculateTotalSteps(images, preserveAnimation, tempDir);
    
    const sendProgress = (stage: 'processing' | 'uploading', current: number, total: number, message?: string) => {
      const progress: ProgressData = {
        current,
        total,
        percent: Math.round((current / total) * 100),
        stage,
        upscaled: 0,
        totalImages: images.length,
        sliced: 0,
        totalFragments: 0,
        converted: 0,
        message: message || 'Обработка',
      };
      event.sender.send(IPC_CHANNELS.SLICING_PROGRESS, progress);
    };

    const workerPath = path.join(__dirname, 'imageWorker.js');
    const worker = new Worker(workerPath);

    let processedSteps = 0;
    await new Promise<void>((resolve, reject) => {
      worker.on('message', (result) => {
        if (result.stage === 'fragmentComplete') {
          processedSteps++;
          sendProgress('processing', processedSteps, totalSteps, 'Обработка');
        } else if (result.stage === 'skip') {
          console.warn(`[Main] Skipped image ${result.imageId}: ${result.reason}`);
        } else if (result.stage === 'allComplete') {
          worker.terminate();
          resolve();
        } else if (result.stage === 'error') {
          console.error(`[Main] Worker error:`, result.error);
          reject(new Error(result.error));
          worker.terminate();
        }
      });

      worker.on('error', (err) => {
        console.error(`[Main] Worker error:`, err);
        reject(err);
        worker.terminate();
      });

      worker.postMessage({
        images: images.map(img => ({
          id: img.id,
          path: img.path,
          rows: img.rows,
          columns: img.columns,
        })),
        targetSize,
        targetDir,
        tempDir,
        upscaleMode,
        downscaleMode,
        preserveAnimation,
        startIndex,
        isVideo: isVideo || preserveAnimation,
        compressionMode: params.compressionMode || 'auto',
      });
    });

    fs.rmSync(tempDir, { recursive: true, force: true });

    const totalFragments = images.reduce((sum, img) => sum + img.rows * img.columns, 0);
    return {
      success: true,
      message: `Создано ${totalFragments} файлов из ${images.length} изображений`,
      filesCreated: totalFragments,
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    };
  }
});

ipcMain.handle(IPC_CHANNELS.CREATE_TELEGRAM_PACK, async (event, params: TelegramPackParams): Promise<TelegramPackResult> => {
  try {
    console.log('[Main] CREATE_TELEGRAM_PACK called');
    
    const { packId, userId, name, title, botToken, fragmentsDir, isVideo, emoji = '😀' } = params;

    if (!fs.existsSync(fragmentsDir)) {
      return { success: false, error: 'Папка с фрагментами не найдена' };
    }

    const files = fs.readdirSync(fragmentsDir)
      .filter(f => f.endsWith('.webp') || f.endsWith('.webm'))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/frag_(\d+)/)?.[1] || '0');
        const bNum = parseInt(b.match(/frag_(\d+)/)?.[1] || '0');
        return aNum - bNum;
      });

    if (files.length === 0) {
      return { success: false, error: 'Нет фрагментов для загрузки' };
    }

    const packDir = path.dirname(fragmentsDir);
    const manifestService = new ManifestService(packDir);
    
    const localPacks = (await store.get('localPacks')) || [];
    const currentPack = localPacks.find((p: LocalPack) => p.id === packId);
    const isUpdate = currentPack?.status === 'telegram';
    
    let fullPackName = name;
    
    if (isUpdate) {
      // Для обновления используем сохраненное имя из манифеста
      const existingManifest = manifestService.load();
      if (existingManifest.packName) {
        fullPackName = existingManifest.packName;
        console.log('[Main] Using saved pack name from manifest:', fullPackName);
      }
    } else {
      // Для нового пака получаем имя с суффиксом
      botClient = new TelegramBotClient(botToken);
      const me = await botClient.bot.api.getMe();
      fullPackName = name.endsWith(`_by_${me.username}`) ? name : `${name}_by_${me.username}`;
      console.log('[Main] New pack name with suffix:', fullPackName);
    }
    
    const manifest = manifestService.initFragments(files, emoji, fullPackName);
    
    if (!botClient) {
      botClient = new TelegramBotClient(botToken);
    }

    // Авто-очистка при обновлении
    if (isUpdate) {
      // Проверяем и обновляем заголовок независимо от стикеров
      const currentSet = await botClient.getStickerSet(fullPackName);
      if (currentSet && currentSet.title !== title) {
        console.log('[Main] Updating pack title from', currentSet.title, 'to', title);
        await botClient.setStickerSetTitle(fullPackName, title);
      }
      
      const localFileIds = new Set(
        manifest.fragments
          .filter(f => f.fileId && fs.existsSync(path.join(fragmentsDir, f.fileName)))
          .map(f => f.fileId!)
      );

      const cleanup = await botClient.syncAndCleanup(fullPackName, localFileIds, fragmentsDir);
      
      if (cleanup.toDelete.length > 0) {
        if (!cleanup.canDelete) {
          return {
            success: false,
            error: 'Невозможно удалить все стикеры. В паке должен остаться хотя бы 1 стикер',
          };
        }

        console.log('[Main] Auto-cleanup: removing', cleanup.toDelete.length, 'stickers');
        
        for (let i = 0; i < cleanup.toDelete.length; i++) {
          const fileId = cleanup.toDelete[i];
          event.sender.send(IPC_CHANNELS.TELEGRAM_UPLOAD_PROGRESS, {
            current: i + 1,
            total: cleanup.toDelete.length,
            percent: Math.round(((i + 1) / cleanup.toDelete.length) * 100),
            stage: 'uploading',
            message: `Удаление отсутствующих фрагментов: ${i + 1} из ${cleanup.toDelete.length}`,
          });
          
          const result = await botClient.deleteStickerFromSet(fileId);
          if (result.success) {
            manifest.fragments = manifest.fragments.filter((f: any) => f.fileId !== fileId);
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        manifestService.save(manifest);
      }
    }
    
    const pendingFragments = manifest.fragments.filter(f => {
      const filePath = path.join(fragmentsDir, f.fileName);
      return f.status === 'pending' && fs.existsSync(filePath);
    });
    const uploadedCount = manifest.fragments.filter(f => f.status === 'uploaded').length;

    if (pendingFragments.length === 0 && uploadedCount > 0) {
      return { 
        success: true, 
        packLink: currentPack?.tgLink || `https://t.me/addstickers/${fullPackName}`,
      };
    }

    const stickers = pendingFragments.map(f => ({
      filePath: path.join(fragmentsDir, f.fileName),
      emoji,
    }));

    if (!botClient) {
      botClient = new TelegramBotClient(botToken);
    }

    const sendProgress = (current: number, total: number) => {
      const percent = Math.round((current / total) * 100);
      event.sender.send(IPC_CHANNELS.TELEGRAM_UPLOAD_PROGRESS, {
        current,
        total,
        percent,
        stage: current === total ? 'complete' : 'uploading',
        message: `Загружено ${current} из ${total}`,
      });
    };

    const result = await botClient.createPack(
      {
        userId,
        name,
        title,
        stickers,
        isAnimated: false,
        isVideo,
        format: isVideo ? 'video' : 'static',
        stickerType: params.outputFormat === 'EMOJI' ? 'custom_emoji' : 'regular',
        isUpdate,
      },
      sendProgress
    );

    if (result.success && result.packLink) {
      console.log('[Main] Upload successful, syncing with Telegram...');
      
      // Получаем полный пак из Telegram
      const stickerSet = await botClient.getStickerSet(fullPackName);
      
      if (stickerSet?.stickers) {
        console.log('[Main] TG pack has', stickerSet.stickers.length, 'stickers');
        
        // Создаем Map из TG стикеров по fileId
        const tgStickersById = new Map(stickerSet.stickers.map((s: any) => [s.file_id, s]));
        
        // Получаем текущий manifest
        const manifest = manifestService.load();
        
        // Обновляем все фрагменты: если fileId уже есть - проверяем что он в TG
        manifest.fragments.forEach((frag: any) => {
          if (frag.fileId && tgStickersById.has(frag.fileId)) {
            frag.status = 'uploaded';
            console.log('[Main] Confirmed', frag.fileName, 'is uploaded with fileId:', frag.fileId);
          }
        });
        
        // Для pending фрагментов пытаемся найти соответствие
        // Берем последние N стикеров из TG (где N = количество pending)
        const pendingFileNames = pendingFragments.map(f => f.fileName);
        const newStickers = stickerSet.stickers.slice(-pendingFileNames.length);
        
        console.log('[Main] Syncing', pendingFileNames.length, 'pending fragments with last', newStickers.length, 'TG stickers');
        
        pendingFileNames.forEach((fileName, i) => {
          if (i < newStickers.length) {
            const tgSticker = newStickers[i];
            console.log('[Main] Marking', fileName, 'as uploaded with fileId:', tgSticker.file_id);
            manifestService.markUploaded(fileName, tgSticker.file_id, tgSticker.emoji);
          }
        });
        
        // Синхронизируем порядок с TG
        const tgOrder = stickerSet.stickers.map((s: any) => {
          const frag = manifest.fragments.find(f => f.fileId === s.file_id);
          return frag?.fileName;
        }).filter(Boolean) as string[];
        
        if (tgOrder.length > 0) {
          const updatedManifest = manifestService.load();
          updatedManifest.order = tgOrder;
          manifestService.save(updatedManifest);
          console.log('[Main] Synced order with TG:', tgOrder.length, 'items');
        }
      }
      
      // Для нового пака просто обновляем существующую запись
      if (!isUpdate) {
        const updatedPacks = localPacks.map((p: LocalPack) => 
          p.id === packId ? { ...p, status: 'telegram' as const, tgLink: result.packLink, tgBotId: params.botId, tgUserId: userId } : p
        );
        await store.set('localPacks', updatedPacks);
      } else {
        // Обновляем существующий пак
        const updatedPacks = localPacks.map((p: LocalPack) => 
          p.id === packId ? { ...p, status: 'telegram' as const, tgLink: result.packLink, tgBotId: params.botId, tgUserId: userId } : p
        );
        await store.set('localPacks', updatedPacks);
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    };
  }
});

app.whenReady().then(() => {
  protocol.registerFileProtocol('local-file', (request, callback) => {
    const url = request.url.replace('local-file://', '');
    const filePath = path.join(app.getPath('userData'), url);
    callback({ path: filePath });
  });
  
  protocol.registerFileProtocol('gif-file', (request, callback) => {
    const filePath = decodeURI(request.url.replace('gif-file://', ''));
    console.log('[Main] Loading gif:', filePath);
    if (fs.existsSync(filePath)) {
      callback({ path: filePath });
    } else {
      console.error('[Main] Gif file not found:', filePath);
      callback({ error: -6 });
    }
  });
  
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
