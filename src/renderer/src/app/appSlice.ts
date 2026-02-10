import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Bot, Preset } from '../../../common/types';

type Page = 'HOME' | 'EDITOR' | 'SETTINGS' | 'ADD_BOT' | 'LIBRARY' | 'PACK_VIEW';

interface AppState {
  currentPage: Page;
  bots: Bot[];
  presets: Preset[];
  selectedBotId: string | null;
  isInitialized: boolean;
  currentPackId: string | null;
}

const initialState: AppState = {
  currentPage: 'HOME',
  bots: [],
  presets: [],
  selectedBotId: null,
  isInitialized: false,
  currentPackId: null,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    navigateTo: (state, action: PayloadAction<Page>) => {
      state.currentPage = action.payload;
    },
    initializeApp: (state, action: PayloadAction<{ bots: Bot[]; presets: Preset[]; selectedBotId: string | null }>) => {
      state.bots = action.payload.bots || [];
      state.presets = action.payload.presets || [];
      state.selectedBotId = action.payload.selectedBotId;
      state.isInitialized = true;
      if (state.bots.length === 0) {
        state.currentPage = 'ADD_BOT';
      }
    },
    addBot: (state, action: PayloadAction<Bot>) => {
      state.bots.push(action.payload);
      if (!state.selectedBotId) {
        state.selectedBotId = action.payload.id;
      }
    },
    updateBot: (state, action: PayloadAction<Bot>) => {
      const index = state.bots.findIndex(b => b.id === action.payload.id);
      if (index !== -1) state.bots[index] = action.payload;
    },
    removeBot: (state, action: PayloadAction<string>) => {
      state.bots = state.bots.filter(b => b.id !== action.payload);
      if (state.selectedBotId === action.payload) {
        state.selectedBotId = state.bots[0]?.id || null;
      }
    },
    selectBot: (state, action: PayloadAction<string>) => {
      state.selectedBotId = action.payload;
    },
    addPreset: (state, action: PayloadAction<Preset>) => {
      state.presets.push(action.payload);
    },
    updatePreset: (state, action: PayloadAction<Preset>) => {
      const index = state.presets.findIndex(p => p.id === action.payload.id);
      if (index !== -1) state.presets[index] = action.payload;
    },
    removePreset: (state, action: PayloadAction<string>) => {
      state.presets = state.presets.filter(p => p.id !== action.payload);
    },
    setCurrentPack: (state, action: PayloadAction<string | null>) => {
      state.currentPackId = action.payload;
    },
  },
});

export const { navigateTo, initializeApp, addBot, updateBot, removeBot, selectBot, addPreset, updatePreset, removePreset, setCurrentPack } = appSlice.actions;
export default appSlice.reducer;
