import { useEffect } from 'react';
import { useAppSelector, useAppDispatch } from './app/hooks';
import { initializeApp } from './app/appSlice';
import { HomePage } from './features/main/HomePage';
import { ImageEditor } from './features/image/ImageEditor';
import { AddBotPage } from './features/settings/AddBotPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { LibraryPage } from './features/library/LibraryPage';
import { PackViewPage } from './features/pack/PackViewPage';
import './shared/styles/global.scss';

function App() {
  const dispatch = useAppDispatch();
  const { currentPage, isInitialized } = useAppSelector((state) => state.app);

  useEffect(() => {
    const init = async () => {
      const bots = await window.electron.store.get('bots') || [];
      const presets = await window.electron.store.get('presets') || [];
      const selectedBotId = await window.electron.store.get('selectedBotId') || null;
      dispatch(initializeApp({ bots, presets, selectedBotId }));
    };
    init();
  }, [dispatch]);

  if (!isInitialized) return null;

  if (currentPage === 'ADD_BOT') return <AddBotPage />;
  if (currentPage === 'SETTINGS') return <SettingsPage />;
  if (currentPage === 'EDITOR') return <ImageEditor />;
  if (currentPage === 'LIBRARY') return <LibraryPage />;
  if (currentPage === 'PACK_VIEW') return <PackViewPage />;
  return <HomePage />;
}

export default App;
