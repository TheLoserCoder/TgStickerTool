import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, SlicingParams, ProgressData, TelegramPackParams, TelegramUploadProgress } from '../common/types';

contextBridge.exposeInMainWorld('electron', {
  selectFiles: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_FILES),
  readImageAsBase64: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_IMAGE, filePath),
  selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY),
  startSlicing: (params: SlicingParams) => ipcRenderer.invoke(IPC_CHANNELS.PROCESS_SLICING, params),
  onSlicingProgress: (callback: (data: ProgressData) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SLICING_PROGRESS, (_, data) => callback(data));
  },
  savePack: (packId: string, packDir: string, originalImagePath: string, packData: any) => 
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_PACK, packId, packDir, originalImagePath, packData),
  deletePack: (packId: string, packDir: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_PACK, packId, packDir),
  openFolder: (folderPath: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_FOLDER, folderPath),
  getFragments: (fragmentsDir: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_FRAGMENTS, fragmentsDir),
  getGifs: () => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_GIFS),
  createTelegramPack: (params: TelegramPackParams) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_TELEGRAM_PACK, params),
  onTelegramUploadProgress: (callback: (data: TelegramUploadProgress) => void) => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.TELEGRAM_UPLOAD_PROGRESS);
    ipcRenderer.on(IPC_CHANNELS.TELEGRAM_UPLOAD_PROGRESS, (_, data) => callback(data));
  },
  onTelegramUploadComplete: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.TELEGRAM_UPLOAD_COMPLETE);
    ipcRenderer.on(IPC_CHANNELS.TELEGRAM_UPLOAD_COMPLETE, (_, data) => callback(data));
  },
  getManifest: (packDir: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_MANIFEST, packDir),
  syncPackWithTelegram: (packDir: string, botToken: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_PACK, packDir, botToken),
  deleteFragment: (filePath: string, packDir?: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_FRAGMENT, filePath, packDir),
  updateFragmentOrder: (packDir: string, order: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_FRAGMENT_ORDER, packDir, order),
  updateManifest: (packDir: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_MANIFEST, packDir),
  reorderStickers: (packDir: string, botToken: string, order: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.REORDER_STICKERS, packDir, botToken, order),
  importLineStickers: (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_LINE_STICKERS, url),
  onLineImportProgress: (callback: (data: { current: number; total: number }) => void) => {
    ipcRenderer.on('line-import-progress', (_, data) => callback(data));
  },
  store: {
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.STORE_GET, key),
    set: (key: string, value: any) => ipcRenderer.invoke(IPC_CHANNELS.STORE_SET, key, value),
  },
});
