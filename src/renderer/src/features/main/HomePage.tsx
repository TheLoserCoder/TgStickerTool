import { useAppDispatch } from '../../app/hooks';
import { navigateTo } from '../../app/appSlice';
import { addImages } from '../image/imageSlice';
import { PlusIcon, GearIcon, ArchiveIcon } from '@radix-ui/react-icons';
import { Button, IconButton } from '../../shared/components/ui';
import uniqueid from 'uniqueid';
import { useState, useEffect } from 'react';
import styles from './HomePage.module.scss';

const generateId = uniqueid('img_');

export function HomePage() {
  const dispatch = useAppDispatch();
  const [randomGif, setRandomGif] = useState<string | null>(null);

  useEffect(() => {
    const loadRandomGif = async () => {
      try {
        const gifs = await window.electron.getGifs();
        if (gifs.length > 0) {
          const randomIndex = Math.floor(Math.random() * gifs.length);
          const gifPath = gifs[randomIndex];
          // Конвертируем абсолютный путь в file:// URL для Electron
          setRandomGif(`file://${gifPath}`);
        }
      } catch (error) {
        console.error('Failed to load gifs:', error);
      }
    };
    loadRandomGif();
  }, []);

  const handleSliceImage = async () => {
    const filePaths = await window.electron.selectFiles();
    if (filePaths && filePaths.length > 0) {
      const images = await Promise.all(
        filePaths.map(async (filePath) => {
          const base64Data = await window.electron.readImageAsBase64(filePath);
          return {
            id: generateId(),
            path: filePath,
            data: base64Data,
            settings: { rows: 1, columns: 1 },
          };
        })
      );
      dispatch(addImages(images));
      dispatch(navigateTo('EDITOR'));
    }
  };

  return (
    <div className={styles.container}>
      <IconButton 
        icon={<GearIcon width={20} height={20} />}
        onClick={() => dispatch(navigateTo('SETTINGS'))}
        className={styles.settingsButton}
      />
      <div className={styles.header}>
        {randomGif && <img src={randomGif} alt="" className={styles.gif} />}
        <h1 className={styles.title}>TgStickerTool</h1>
      </div>
      <div className={styles.actions}>
        <Button icon={<PlusIcon width={18} height={18} />} onClick={handleSliceImage}>
          Нарезать изображение
        </Button>
        <Button variant="secondary" icon={<ArchiveIcon width={18} height={18} />} onClick={() => dispatch(navigateTo('LIBRARY'))}>
          Мои стикеры
        </Button>
      </div>
    </div>
  );
}
