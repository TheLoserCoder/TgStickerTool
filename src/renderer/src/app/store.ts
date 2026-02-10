import { configureStore } from '@reduxjs/toolkit';
import counterReducer from '../features/counter/counterSlice';
import appReducer from './appSlice';
import imageReducer from '../features/image/imageSlice';

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    app: appReducer,
    image: imageReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
