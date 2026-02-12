export interface ElectronAPI {
  selectFiles: () => Promise<string[] | null>;
  readImageAsBase64: (filePath: string) => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  startSlicing: (params: SlicingParams) => Promise<SlicingResult>;
  onSlicingProgress: (callback: (data: ProgressData) => void) => void;
  savePack: (packId: string, packDir: string, originalImagePath: string, packData: LocalPack) => Promise<void>;
  deletePack: (packId: string, packDir: string) => Promise<void>;
  openFolder: (folderPath: string) => Promise<void>;
  getFragments: (fragmentsDir: string) => Promise<string[]>;
  getGifs: () => Promise<string[]>;
  createTelegramPack: (params: TelegramPackParams) => Promise<TelegramPackResult>;
  onTelegramUploadProgress: (callback: (data: TelegramUploadProgress) => void) => void;
  onTelegramUploadComplete: (callback: (data: any) => void) => void;
  getManifest: (packDir: string) => Promise<FragmentManifest | null>;
  syncPackWithTelegram: (packDir: string, botToken: string) => Promise<{ success: boolean; error?: string }>;
  deleteFragment: (filePath: string, packDir?: string) => Promise<void>;
  updateFragmentOrder: (packDir: string, order: string[]) => Promise<void>;
  updateManifest: (packDir: string) => Promise<void>;
  reorderStickers: (packDir: string, botToken: string, order: string[]) => Promise<{ success: boolean; moved?: number; error?: string }>;
  importLineStickers: (url: string) => Promise<{ success: boolean; filePaths?: string[]; tempDir?: string; error?: string }>;
  onLineImportProgress: (callback: (data: { current: number; total: number }) => void) => void;
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
  };
}

export interface Bot {
  id: string;
  name: string;
  token: string;
  ownerId: string;
}

export interface Preset {
  id: string;
  name: string;
  rows: number;
  columns: number;
  upscaleMode: UpscaleMode;
  downscaleMode: DownscaleMode;
  outputFormat: OutputFormat;
  preserveAnimation: boolean;
}

export interface LocalPack {
  id: string;
  name: string;
  createdAt: string;
  previewPath: string;
  originalImagePath: string;
  fragmentsDir: string;
  fragmentCount: number;
  nextFragmentIndex: number;
  settings: {
    rows: number;
    columns: number;
    outputFormat: OutputFormat;
    upscaleMode: UpscaleMode;
    downscaleMode: DownscaleMode;
  };
  status: 'local' | 'telegram';
  isAnimated: boolean;
  tgLink?: string;
  tgBotId?: string;
  tgUserId?: number;
  uploadedFragments?: string[];
  manifestPath?: string;
}

export interface FragmentManifest {
  fragments: Array<{
    fileName: string;
    status: 'pending' | 'uploaded';
    emoji?: string;
    fileId?: string;
  }>;
  packName?: string;
  lastUpdated: string;
  order?: string[];
  pendingReorder?: boolean;
}

export type OutputFormat = 'STICKER' | 'EMOJI';
export type UpscaleMode = 'soft' | 'sharp' | 'none';
export type DownscaleMode = 'none' | 'highQuality';

export interface ImageSettings {
  rows: number;
  columns: number;
}

export interface SlicingParams {
  images: Array<{
    id: string;
    path: string;
    rows: number;
    columns: number;
  }>;
  targetDir: string;
  outputFormat: OutputFormat;
  upscaleMode: UpscaleMode;
  downscaleMode: DownscaleMode;
  preserveAnimation: boolean;
  performanceMode: 'minimal' | 'balanced' | 'maximum';
  startIndex?: number;
  isVideo?: boolean;
  compressionMode?: 'none' | 'auto';
}

export interface SlicingResult {
  success: boolean;
  message: string;
  filesCreated?: number;
  warnings?: string[];
}

export interface ProgressData {
  current: number;
  total: number;
  percent: number;
  stage: 'upscaling' | 'slicing' | 'converting';
  upscaled: number;
  totalImages: number;
  sliced: number;
  totalFragments: number;
  converted: number;
  message?: string;
}

export interface TelegramPackParams {
  packId: string;
  userId: number;
  name: string;
  title: string;
  botToken: string;
  botId: string;
  fragmentsDir: string;
  isVideo: boolean;
  outputFormat: OutputFormat;
  emoji?: string;
  deletedFiles?: string[];
}

export interface TelegramPackResult {
  success: boolean;
  packLink?: string;
  error?: string;
  errorCode?: string;
}

export interface TelegramUploadProgress {
  current: number;
  total: number;
  percent: number;
  stage: 'creating' | 'uploading' | 'complete' | 'error';
  message: string;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export const IPC_CHANNELS = {
  SELECT_FILES: 'dialog:selectFiles',
  READ_IMAGE: 'fs:readImage',
  SELECT_DIRECTORY: 'dialog:selectDirectory',
  PROCESS_SLICING: 'image:processSlicing',
  SLICING_PROGRESS: 'slicing-progress',
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  SAVE_PACK: 'pack:save',
  DELETE_PACK: 'pack:delete',
  DELETE_FRAGMENT: 'fs:deleteFragment',
  OPEN_FOLDER: 'fs:openFolder',
  GET_FRAGMENTS: 'fs:getFragments',
  GET_GIFS: 'fs:getGifs',
  CREATE_TELEGRAM_PACK: 'telegram:createPack',
  TELEGRAM_UPLOAD_PROGRESS: 'telegram:uploadProgress',
  TELEGRAM_UPLOAD_COMPLETE: 'telegram:uploadComplete',
  GET_MANIFEST: 'pack:getManifest',
  SYNC_PACK: 'pack:sync',
  UPDATE_FRAGMENT_ORDER: 'pack:updateFragmentOrder',
  UPDATE_MANIFEST: 'pack:updateManifest',
  REORDER_STICKERS: 'pack:reorderStickers',
  IMPORT_LINE_STICKERS: 'line:importStickers',
} as const;
