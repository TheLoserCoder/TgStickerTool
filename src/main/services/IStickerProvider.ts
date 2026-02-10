export interface IStickerProvider {
  createPack(params: CreatePackParams, onProgress?: (current: number, total: number) => void): Promise<CreatePackResult>;
  addSticker(userId: number, packName: string, sticker: StickerData, format: string): Promise<{ success: boolean; fileId?: string }>;
  deleteStickerFromSet(fileId: string): Promise<boolean>;
  getStickerSet(name: string): Promise<any>;
  getPackLink(packName: string): string;
  syncPackWithTelegram(packName: string, localFiles: string[]): Promise<SyncResult>;
}

export interface SyncResult {
  success: boolean;
  matches: Array<{ fileName: string; fileId: string | null; status: 'uploaded' | 'pending' }>;
  error?: string;
}

export interface CreatePackParams {
  userId: number;
  name: string;
  title: string;
  stickers: StickerData[];
  isAnimated: boolean;
  isVideo: boolean;
  format: 'static' | 'animated' | 'video';
  stickerType?: 'regular' | 'custom_emoji';
  isUpdate?: boolean;
}

export interface StickerData {
  filePath: string;
  emoji: string;
}

export interface CreatePackResult {
  success: boolean;
  packLink?: string;
  error?: string;
  errorCode?: string;
}
