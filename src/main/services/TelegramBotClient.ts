import { Bot, InputFile, ApiClientOptions } from 'grammy';
import * as fs from 'fs';
import { IStickerProvider, CreatePackParams, CreatePackResult, StickerData } from './IStickerProvider';
import axios from 'axios';

export class TelegramBotClient implements IStickerProvider {
  public bot: Bot;
  private token: string;

  constructor(token: string) {
    this.token = token;
    
    // Патч для fetch: добавляем duplex: 'half' для всех запросов с body
    if (typeof globalThis.fetch === 'function') {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        if (init && init.body && !(init as any).duplex) {
          (init as any).duplex = 'half';
        }
        return originalFetch(input, init);
      };
    }
    
    const FormData = require('form-data');
    
    const customFetch = async (url: string, init?: any) => {
      try {
        const options: any = {
          method: init?.method || 'GET',
          url: url,
          headers: init?.headers || {},
        };

        if (init?.body) {
          if (typeof init.body === 'string') {
            options.data = init.body;
            options.headers['Content-Type'] = 'application/json';
          } else if (init.body.constructor && init.body.constructor.name === 'FormData') {
            const formData = new FormData();
            for (const [key, value] of init.body.entries()) {
              formData.append(key, value);
            }
            options.data = formData;
            options.headers = { ...options.headers, ...formData.getHeaders() };
          } else {
            options.data = init.body;
          }
        }

        const response = await axios(options);
        
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          statusText: response.statusText,
          headers: new Map(Object.entries(response.headers)),
          json: async () => response.data,
          text: async () => JSON.stringify(response.data),
        };
      } catch (error: any) {
        if (error.response) {
          return {
            ok: false,
            status: error.response.status,
            statusText: error.response.statusText,
            headers: new Map(Object.entries(error.response.headers)),
            json: async () => error.response.data,
            text: async () => JSON.stringify(error.response.data),
          };
        }
        throw error;
      }
    };

    this.bot = new Bot(token, {
      client: {
        apiRoot: 'https://api.telegram.org',
        environment: {
          fetch: customFetch as any,
        },
      },
    });
  }

  async createPack(
    params: CreatePackParams,
    onProgress?: (current: number, total: number) => void
  ): Promise<CreatePackResult> {
    console.log('[TelegramBot] Starting pack creation:', { userId: params.userId, name: params.name, title: params.title, stickerCount: params.stickers.length, stickerType: params.stickerType, isUpdate: params.isUpdate });
    try {
      const { userId, name, title, stickers, isVideo, format, stickerType = 'regular', isUpdate = false } = params;

      if (stickers.length === 0) {
        console.error('[TelegramBot] No stickers provided');
        return { success: false, error: 'Нет стикеров для загрузки' };
      }

      const me = await this.bot.api.getMe();
      const botUsername = me.username;
      console.log('[TelegramBot] Bot username:', botUsername);

      let finalName = name;
      if (!name.endsWith(`_by_${botUsername}`)) {
        finalName = `${name}_by_${botUsername}`;
        console.log('[TelegramBot] Added bot suffix to pack name:', finalName);
      }

      const firstSticker = stickers[0];
      const isWebm = firstSticker.filePath.endsWith('.webm');
      const stickerFormat = isWebm ? 'video' : (format === 'animated' ? 'animated' : 'static');
      
      console.log('[TelegramBot] Sticker format:', stickerFormat);
      console.log('[TelegramBot] Sticker type:', stickerType);
      console.log('[TelegramBot] Is update:', isUpdate);

      // Проверяем существование пака
      const setExists = await this.getStickerSet(finalName);
      const shouldUpdate = isUpdate && setExists !== null;
      
      if (isUpdate && !setExists) {
        console.log('[TelegramBot] Pack not found, creating new instead of updating');
      }

      if (shouldUpdate) {
        console.log('[TelegramBot] Updating existing pack:', finalName);
        
        for (let i = 0; i < stickers.length; i++) {
          console.log(`[TelegramBot] Adding sticker ${i + 1}/${stickers.length}`);
          const result = await this.addSticker(userId, finalName, stickers[i], stickerFormat);
          
          if (!result.success) {
            return {
              success: false,
              error: `Ошибка при добавлении стикера ${i + 1}/${stickers.length}`,
              errorCode: 'UPLOAD_FAILED',
            };
          }
          
          onProgress?.(i + 1, stickers.length);
          await this.delay(isWebm ? 800 : 400);
        }
      } else {
        console.log('[TelegramBot] Creating new sticker set...');
        
        if (stickerType === 'custom_emoji') {
          const allStickerParams = stickers.map(sticker => {
            const buffer = fs.readFileSync(sticker.filePath);
            const isWebm = sticker.filePath.endsWith('.webm');
            return {
              sticker: new InputFile(buffer, isWebm ? 'sticker.webm' : 'sticker.webp'),
              emoji_list: [sticker.emoji],
              format: isWebm ? 'video' : stickerFormat,
            };
          });
          
          await this.bot.api.createNewStickerSet(
            userId,
            finalName,
            title,
            allStickerParams,
            { sticker_type: 'custom_emoji' }
          );
          
          console.log('[TelegramBot] Custom emoji set created');
          if (onProgress) {
            for (let i = 1; i <= stickers.length; i++) {
              onProgress(i, stickers.length);
            }
          }
        } else {
          const firstStickerBuffer = fs.readFileSync(firstSticker.filePath);
          const isWebm = firstSticker.filePath.endsWith('.webm');
          const actualFormat = isWebm ? 'video' : stickerFormat;
          const stickerParams: any = [
            {
              sticker: new InputFile(firstStickerBuffer, isWebm ? 'sticker.webm' : 'sticker.webp'),
              emoji_list: [firstSticker.emoji],
              format: actualFormat,
            },
          ];
          
          await this.bot.api.createNewStickerSet(
            userId,
            finalName,
            title,
            stickerParams
          );
          
          console.log('[TelegramBot] Sticker set created');
          onProgress?.(1, stickers.length);

          for (let i = 1; i < stickers.length; i++) {
            console.log(`[TelegramBot] Adding sticker ${i + 1}/${stickers.length}`);
            const result = await this.addSticker(userId, finalName, stickers[i], stickerFormat);
            
            if (!result.success) {
              return {
                success: false,
                error: `Ошибка при загрузке стикера ${i + 1}/${stickers.length}`,
                errorCode: 'UPLOAD_FAILED',
              };
            }
            
            onProgress?.(i + 1, stickers.length);
            await this.delay(stickers[i].filePath.endsWith('.webm') ? 800 : 400);
          }
        }
      }

      const packLink = this.getPackLink(finalName);
      console.log('[TelegramBot] Pack created/updated:', packLink);
      return { success: true, packLink };
    } catch (error: any) {
      console.error('[TelegramBot] Error creating pack:', error);
      return this.handleError(error);
    }
  }

  async addSticker(userId: number, packName: string, sticker: StickerData, format: string): Promise<{ success: boolean; fileId?: string }> {
    try {
      console.log('[TelegramBot] Adding sticker to pack:', packName);
      const stickerBuffer = fs.readFileSync(sticker.filePath);
      const isWebm = sticker.filePath.endsWith('.webm');
      const actualFormat = isWebm ? 'video' : format;
      
      await this.bot.api.addStickerToSet(
        userId,
        packName,
        {
          sticker: new InputFile(stickerBuffer, isWebm ? 'sticker.webm' : 'sticker.webp'),
          emoji_list: [sticker.emoji],
          format: actualFormat as any,
        }
      );
      
      const stickerSet = await this.getStickerSet(packName);
      if (stickerSet?.stickers?.length > 0) {
        const lastSticker = stickerSet.stickers[stickerSet.stickers.length - 1];
        console.log('[TelegramBot] Sticker added with fileId:', lastSticker.file_id);
        return { success: true, fileId: lastSticker.file_id };
      }
      
      return { success: true };
    } catch (error: any) {
      console.error('[TelegramBot] Error adding sticker:', error);
      return { success: false };
    }
  }

  async deleteStickerFromSet(fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.bot.api.deleteStickerFromSet(fileId);
      console.log('[TelegramBot] Deleted sticker with fileId:', fileId);
      return { success: true };
    } catch (error: any) {
      console.error('[TelegramBot] Error deleting sticker:', error);
      if (error.message?.includes('STICKERSET_NOT_MODIFIED')) {
        return { success: false, error: 'STICKERSET_NOT_MODIFIED' };
      }
      return { success: false, error: error.message };
    }
  }

  async syncAndCleanup(packName: string, localFileIds: Set<string>, fragmentsDir: string): Promise<{ toDelete: string[]; canDelete: boolean }> {
    try {
      const stickerSet = await this.getStickerSet(packName);
      if (!stickerSet) {
        return { toDelete: [], canDelete: false };
      }

      const toDelete: string[] = [];
      
      for (const sticker of stickerSet.stickers) {
        if (!localFileIds.has(sticker.file_id)) {
          console.log('[TelegramBot] Local file missing for sticker', sticker.file_id, ', marking for removal');
          toDelete.push(sticker.file_id);
        }
      }

      const remainingCount = stickerSet.stickers.length - toDelete.length;
      const canDelete = remainingCount >= 1;

      if (!canDelete && toDelete.length > 0) {
        console.log('[TelegramBot] Cannot delete all stickers, at least 1 must remain');
      }

      return { toDelete, canDelete };
    } catch (error: any) {
      console.error('[TelegramBot] Error in syncAndCleanup:', error);
      return { toDelete: [], canDelete: false };
    }
  }

  async getStickerSet(name: string): Promise<any> {
    try {
      const stickerSet = await this.bot.api.getStickerSet(name);
      return stickerSet;
    } catch (error) {
      console.error('[TelegramBot] Error getting sticker set:', error);
      return null;
    }
  }

  async setStickerSetTitle(name: string, title: string): Promise<boolean> {
    try {
      await this.bot.api.setStickerSetTitle(name, title);
      console.log('[TelegramBot] Updated sticker set title:', title);
      return true;
    } catch (error) {
      console.error('[TelegramBot] Error updating sticker set title:', error);
      return false;
    }
  }

  getPackLink(packName: string): string {
    return `https://t.me/addstickers/${packName}`;
  }

  async setStickerPositionInSet(fileId: string, position: number): Promise<boolean> {
    try {
      await this.bot.api.setStickerPositionInSet(fileId, position);
      console.log('[TelegramBot] Moved sticker', fileId, 'to position', position);
      return true;
    } catch (error: any) {
      console.error('[TelegramBot] Error moving sticker:', error);
      return false;
    }
  }

  async reorderStickers(packName: string, desiredOrder: string[]): Promise<{ success: boolean; moved: number }> {
    try {
      const stickerSet = await this.getStickerSet(packName);
      if (!stickerSet) {
        return { success: false, moved: 0 };
      }

      const currentOrder = stickerSet.stickers.map((s: any) => s.file_id);
      let moved = 0;

      for (let i = 0; i < desiredOrder.length; i++) {
        const fileId = desiredOrder[i];
        const currentPos = currentOrder.indexOf(fileId);
        
        if (currentPos !== i && currentPos !== -1) {
          const success = await this.setStickerPositionInSet(fileId, i);
          if (success) {
            moved++;
            currentOrder.splice(currentPos, 1);
            currentOrder.splice(i, 0, fileId);
            await this.delay(500);
          }
        }
      }

      console.log('[TelegramBot] Reordered', moved, 'stickers');
      return { success: true, moved };
    } catch (error: any) {
      console.error('[TelegramBot] Error reordering:', error);
      return { success: false, moved: 0 };
    }
  }

  async syncPackWithTelegram(packName: string, localManifest: any): Promise<any> {
    try {
      const stickerSet = await this.getStickerSet(packName);
      if (!stickerSet) {
        return { success: false, error: 'Пак не найден в Telegram' };
      }

      const tgStickers = stickerSet.stickers;
      console.log('[TelegramBot] Sync: TG has', tgStickers.length, 'stickers');

      // Создаем Set из TG fileId
      const tgFileIds = new Set(tgStickers.map(s => s.file_id));
      const localFileIds = new Set(localManifest.fragments.map((f: any) => f.fileId).filter(Boolean));

      // Обновляем локальные фрагменты которые есть в TG
      const updatedFragments = localManifest.fragments.map((frag: any) => {
        if (frag.fileId && tgFileIds.has(frag.fileId)) {
          return { ...frag, status: 'uploaded' };
        }
        return frag;
      });

      // Находим стикеры из TG которых нет локально
      const missingInLocal = tgStickers
        .filter(s => !localFileIds.has(s.file_id))
        .map(s => ({
          fileId: s.file_id,
          emoji: s.emoji,
          isVideo: s.is_video || false
        }));

      console.log('[TelegramBot] Missing in local:', missingInLocal.length);

      return { success: true, updatedFragments, missingInLocal };
    } catch (error: any) {
      console.error('[TelegramBot] Sync error:', error);
      return { success: false, error: error.message };
    }
  }

  async downloadSticker(fileId: string, destPath: string): Promise<boolean> {
    try {
      const file = await this.bot.api.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`;
      
      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'arraybuffer'
      });
      
      fs.writeFileSync(destPath, Buffer.from(response.data));
      console.log('[TelegramBot] Downloaded sticker to:', destPath);
      return true;
    } catch (error: any) {
      console.error('[TelegramBot] Error downloading sticker:', error);
      return false;
    }
  }

  private handleError(error: any): CreatePackResult {
    const errorMessage = error.message || error.description || 'Неизвестная ошибка';
    console.error('[TelegramBot] Handling error:', errorMessage);
    
    if (errorMessage.includes('Network request') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('ETIMEDOUT')) {
      console.error('[TelegramBot] Network error detected');
      return {
        success: false,
        error: 'Ошибка сети. Проверьте подключение к интернету',
        errorCode: 'NETWORK_ERROR',
      };
    }

    if (errorMessage.includes('user not found') || errorMessage.includes('PEER_ID_INVALID') || errorMessage.includes('bot was blocked')) {
      console.error('[TelegramBot] User not found - user needs to start bot');
      return {
        success: false,
        error: 'Ошибка: Вы должны хотя бы раз написать вашему боту (нажать /start) перед созданием пака',
        errorCode: 'PEER_ID_INVALID',
      };
    }

    if (errorMessage.includes('STICKER_PNG_DIMENSIONS') || errorMessage.includes('STICKER_VIDEO_DIMENSIONS') || errorMessage.includes('dimensions')) {
      console.error('[TelegramBot] Invalid sticker dimensions');
      return {
        success: false,
        error: 'Неверные размеры стикера. Видео-стикеры должны быть 512x512 пикселей',
        errorCode: 'STICKER_DIMENSIONS',
      };
    }

    if (errorMessage.includes('STICKERSET_INVALID') || errorMessage.includes('name is already taken')) {
      console.error('[TelegramBot] Pack name already taken');
      return {
        success: false,
        error: 'Имя стикерпака уже занято. Выберите другое имя',
        errorCode: 'PACK_NAME_OCCUPIED',
      };
    }

    console.error('[TelegramBot] Unknown error type');
    return {
      success: false,
      error: `Ошибка Telegram: ${errorMessage}`,
      errorCode: 'UNKNOWN',
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
