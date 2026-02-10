import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Worker } from 'worker_threads';
import sharp from 'sharp';
import uniqueid from 'uniqueid';
import { IPC_CHANNELS, SlicingParams, SlicingResult, ProgressData, TelegramPackParams, TelegramPackResult, LocalPack, FragmentManifest } from '../common/types';
import { TelegramBotClient } from './services/TelegramBotClient';
import { ManifestService } from './services/ManifestService';
import { SyncResult } from './services/IStickerProvider';

import Store from 'electron-store';
const store = new Store();

let mainWindow: BrowserWindow | null = null;
let botClient: TelegramBotClient | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  store.set('userDataPath', app.getPath('userData'));

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
    const files = fs.readdirSync(fragmentsDir).filter(f => f.endsWith('.webp') || f.endsWith('.webm'));
    
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
  } catch (error) {
    console.error('Error saving pack:', error);
  }
});

ipcMain.handle(IPC_CHANNELS.DELETE_PACK, async (_, packId: string, packDir: string) => {
  try {
    if (packDir && fs.existsSync(packDir)) {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('Error deleting pack:', error);
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
    const gifsDir = path.join(__dirname, '../public/gifs');
    if (!fs.existsSync(gifsDir)) {
      return [];
    }
    const files = fs.readdirSync(gifsDir)
      .filter(f => f.toLowerCase().endsWith('.gif'))
      .map(f => `../gifs/${f}`);
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

ipcMain.handle(IPC_CHANNELS.REORDER_STICKERS, async (_, packDir: string, botToken: string, desiredOrder: string[]) => {
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
    const result = await botClient.reorderStickers(manifest.packName, fileIds);
    
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

ipcMain.handle(IPC_CHANNELS.PROCESS_SLICING, async (event, params: SlicingParams): Promise<SlicingResult> => {
  try {
    const { images, targetDir, outputFormat, upscaleMode, startIndex = 0 } = params;
    
    fs.mkdirSync(targetDir, { recursive: true });
    
    const tempDir = path.join(os.tmpdir(), `slicing-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const targetSize = outputFormat === 'STICKER' ? 512 : 100;
    let totalFragments = 0;
    const imageData: Array<{ id: string; path: string; rows: number; columns: number; canvas: Buffer; isAnimated: boolean }> = [];

    let upscaled = 0;
    let sliced = 0;
    let converted = 0;

    const sendProgress = (stage: 'upscaling' | 'slicing' | 'converting') => {
      totalFragments = images.reduce((sum, img) => sum + img.rows * img.columns, 0);
      const progress: ProgressData = {
        current: converted,
        total: totalFragments,
        percent: Math.round((converted / totalFragments) * 100),
        stage,
        upscaled,
        totalImages: images.length,
        sliced,
        totalFragments,
        converted,
      };
      event.sender.send(IPC_CHANNELS.SLICING_PROGRESS, progress);
    };

    // Апскейлинг всех изображений
    for (const img of images) {
      const sharpInstance = sharp(img.path, { animated: true });
      const metadata = await sharpInstance.metadata();
      const isAnimated = metadata.pages && metadata.pages > 1;

      const W = metadata.width!;
      let H = metadata.height!;
      if (isAnimated) H = metadata.pageHeight || H / metadata.pages!;

      const S = Math.max(Math.ceil(W / img.columns), Math.ceil(H / img.rows));
      const totalW = S * img.columns;
      const totalH = S * img.rows;

      const extendLeft = Math.floor((totalW - W) / 2);
      const extendTop = Math.floor((totalH - H) / 2);
      const extendRight = totalW - W - extendLeft;
      const extendBottom = totalH - H - extendTop;

      const canvas = await sharp(img.path, isAnimated ? { animated: true } : {})
        .extend({
          top: extendTop,
          bottom: extendBottom,
          left: extendLeft,
          right: extendRight,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .toBuffer();

      const finalCanvasSize = targetSize * Math.max(img.rows, img.columns);
      const scaleFactor = finalCanvasSize / Math.max(totalW, totalH);

      let upscaledCanvas: Buffer;
      if (upscaleMode === 'none') {
        upscaledCanvas = await sharp(canvas, isAnimated ? { animated: true } : {})
          .resize(
            Math.round(totalW * scaleFactor),
            Math.round(totalH * scaleFactor),
            { kernel: 'lanczos3', fastShrinkOnLoad: false }
          )
          .toBuffer();
      } else if (upscaleMode === 'sharp') {
        upscaledCanvas = await sharp(canvas, isAnimated ? { animated: true } : {})
          .linear(1.1, -0.05)
          .resize(
            Math.round(totalW * scaleFactor * 1.1),
            Math.round(totalH * scaleFactor * 1.1),
            { kernel: 'mitchell', fastShrinkOnLoad: false }
          )
          .sharpen({ sigma: 1.2, m1: 0.2, m2: 20.0 })
          .resize(
            Math.round(totalW * scaleFactor),
            Math.round(totalH * scaleFactor),
            { kernel: 'mitchell', fastShrinkOnLoad: false }
          )
          .modulate({ saturation: 1.15, brightness: 1.02 })
          .toBuffer();
      } else {
        upscaledCanvas = await sharp(canvas, isAnimated ? { animated: true } : {})
          .sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 })
          .resize(
            Math.round(totalW * scaleFactor),
            Math.round(totalH * scaleFactor),
            { kernel: 'lanczos3', fastShrinkOnLoad: false }
          )
          .sharpen({ sigma: 0.8, m1: 1.0, m2: 0.5 })
          .modulate({ saturation: 1.15, brightness: 1.02 })
          .toBuffer();
      }

      imageData.push({ id: img.id, path: img.path, rows: img.rows, columns: img.columns, canvas: upscaledCanvas, isAnimated });
      upscaled++;
      sendProgress('upscaling');
    }

    // Параллельная нарезка и конвертация
    const maxWorkers = os.cpus().length;
    const tasks: Array<{ imageId: string; row: number; col: number; canvas: Buffer; isAnimated: boolean; globalIndex: number }> = [];

    let globalFragmentIndex = startIndex;
    for (const img of imageData) {
      for (let row = 0; row < img.rows; row++) {
        for (let col = 0; col < img.columns; col++) {
          tasks.push({ imageId: img.id, row, col, canvas: img.canvas, isAnimated: img.isAnimated, globalIndex: globalFragmentIndex });
          globalFragmentIndex++;
        }
      }
    }

    const workerPath = path.join(__dirname, 'tileWorker.js');

    await new Promise<void>((resolve, reject) => {
      const activeWorkers = new Set<Worker>();
      let taskIndex = 0;
      const results: Array<{ globalIndex: number; success: boolean }> = [];

      const checkCompletion = () => {
        if (taskIndex >= tasks.length && activeWorkers.size === 0) {
          results.sort((a, b) => a.globalIndex - b.globalIndex);
          resolve();
        }
      };

      const startWorker = () => {
        if (taskIndex >= tasks.length) {
          checkCompletion();
          return;
        }

        const task = tasks[taskIndex++];
        const worker = new Worker(workerPath);
        activeWorkers.add(worker);

        worker.on('message', (result) => {
          if (result.stage === 'sliced') {
            sliced++;
            sendProgress('slicing');
          } else if (result.success) {
            converted++;
            results.push({ globalIndex: task.globalIndex, success: true });
            sendProgress('converting');
            worker.terminate();
            activeWorkers.delete(worker);
            startWorker();
          } else {
            reject(new Error(result.error));
            worker.terminate();
            activeWorkers.delete(worker);
          }
        });

        worker.on('error', (err) => {
          reject(err);
          worker.terminate();
          activeWorkers.delete(worker);
        });

        worker.postMessage({
          canvasBuffer: task.canvas,
          isAnimated: task.isAnimated,
          row: task.row,
          col: task.col,
          targetSize,
          targetDir,
          tempDir,
          upscaleMode,
          imageId: task.imageId,
          globalIndex: task.globalIndex,
        });
      };

      for (let i = 0; i < Math.min(maxWorkers, tasks.length); i++) {
        startWorker();
      }
    });

    fs.rmSync(tempDir, { recursive: true, force: true });

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
    
    const pendingFragments = manifest.fragments.filter(f => f.status === 'pending');
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
      const stickerSet = await botClient.getStickerSet(fullPackName);
      
      if (stickerSet?.stickers) {
        if (params.outputFormat === 'EMOJI' && !isUpdate) {
          manifestService.syncWithTelegram(files, stickerSet.stickers, emoji);
        } else {
          const uploadedFileNames = pendingFragments.map(f => f.fileName);
          const startIndex = Math.max(0, stickerSet.stickers.length - uploadedFileNames.length);
          const newStickers = stickerSet.stickers.slice(startIndex);
          
          uploadedFileNames.forEach((fileName, i) => {
            if (i < newStickers.length) {
              manifestService.markUploaded(fileName, newStickers[i].file_id, emoji);
            }
          });
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
    
    event.sender.send(IPC_CHANNELS.TELEGRAM_UPLOAD_COMPLETE, {
      success: result.success,
      packLink: result.packLink,
      error: result.error,
    });

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
