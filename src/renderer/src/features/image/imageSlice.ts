import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OutputFormat, UpscaleMode, ImageSettings } from '../../../common/types';

interface ImageItem {
  id: string;
  path: string;
  data: string;
  settings: ImageSettings;
}

interface ImageState {
  images: ImageItem[];
  activeImageId: string | 'all';
  zoom: number;
  outputFormat: OutputFormat;
  upscaleMode: UpscaleMode;
  globalSettings: ImageSettings;
  isProcessing: boolean;
  progress: {
    upscaled: number;
    totalImages: number;
    sliced: number;
    totalFragments: number;
    converted: number;
    stage: string;
  };
}

const initialState: ImageState = {
  images: [],
  activeImageId: 'all',
  zoom: 1,
  outputFormat: 'STICKER',
  upscaleMode: 'soft',
  globalSettings: { rows: 1, columns: 1 },
  isProcessing: false,
  progress: {
    upscaled: 0,
    totalImages: 0,
    sliced: 0,
    totalFragments: 0,
    converted: 0,
    stage: '',
  },
};

const imageSlice = createSlice({
  name: 'image',
  initialState,
  reducers: {
    addImages: (state, action: PayloadAction<ImageItem[]>) => {
      const existingPaths = new Set(state.images.map(img => img.path));
      const newImages = action.payload.filter(img => !existingPaths.has(img.path));
      state.images = [...state.images, ...newImages];
      if (state.images.length === newImages.length) {
        state.activeImageId = newImages.length > 1 ? 'all' : newImages[0]?.id || 'all';
      }
    },
    removeImage: (state, action: PayloadAction<string>) => {
      state.images = state.images.filter(img => img.id !== action.payload);
      if (state.activeImageId === action.payload) {
        state.activeImageId = state.images.length > 1 ? 'all' : state.images[0]?.id || 'all';
      }
      if (state.images.length === 0) {
        return initialState;
      }
    },
    setActiveImage: (state, action: PayloadAction<string>) => {
      state.activeImageId = action.payload;
    },
    updateImageSettings: (state, action: PayloadAction<{ id: string; settings: Partial<ImageSettings> }>) => {
      const image = state.images.find(img => img.id === action.payload.id);
      if (image) {
        image.settings = { ...image.settings, ...action.payload.settings };
      }
    },
    updateGlobalSettings: (state, action: PayloadAction<Partial<ImageSettings>>) => {
      state.globalSettings = { ...state.globalSettings, ...action.payload };
      state.images.forEach(img => {
        img.settings = { ...state.globalSettings, ...action.payload };
      });
    },
    setZoom: (state, action: PayloadAction<number>) => {
      state.zoom = Math.max(0.1, Math.min(10, action.payload));
    },
    increaseZoom: (state) => {
      state.zoom = Math.min(10, state.zoom + 0.1);
    },
    decreaseZoom: (state) => {
      state.zoom = Math.max(0.1, state.zoom - 0.1);
    },
    resetZoom: (state) => {
      state.zoom = 1;
    },
    setOutputFormat: (state, action: PayloadAction<OutputFormat>) => {
      state.outputFormat = action.payload;
    },
    setUpscaleMode: (state, action: PayloadAction<UpscaleMode>) => {
      state.upscaleMode = action.payload;
    },
    setProcessing: (state, action: PayloadAction<boolean>) => {
      state.isProcessing = action.payload;
    },
    setProgress: (state, action: PayloadAction<Partial<ImageState['progress']>>) => {
      state.progress = { ...state.progress, ...action.payload };
    },
    resetImage: () => initialState,
  },
});

export const {
  addImages,
  removeImage,
  setActiveImage,
  updateImageSettings,
  updateGlobalSettings,
  setZoom,
  increaseZoom,
  decreaseZoom,
  resetZoom,
  setOutputFormat,
  setUpscaleMode,
  setProcessing,
  setProgress,
  resetImage,
} = imageSlice.actions;
export default imageSlice.reducer;
