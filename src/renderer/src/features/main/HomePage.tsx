import { useAppDispatch } from '../../app/hooks';
import { navigateTo } from '../../app/appSlice';
import { addImages } from '../image/imageSlice';
import { PlusIcon, GearIcon, ArchiveIcon, DownloadIcon } from '@radix-ui/react-icons';
import { Button, IconButton, ImportLineDialog } from '../../shared/components/ui';
import uniqueid from 'uniqueid';
import { useState, useEffect } from 'react';
import styles from './HomePage.module.scss';

let imageIdCounter = 0;
const generateImageId = () => `img_${Date.now()}_${imageIdCounter++}`;

export function HomePage() {
  const dispatch = useAppDispatch();
  const [randomGif, setRandomGif] = useState<string | null>(null);
  const [showLineDialog, setShowLineDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const loadRandomGif = async () => {
      try {
        const gifs = await window.electron.getGifs();
        if (gifs.length > 0) {
          const randomIndex = Math.floor(Math.random() * gifs.length);
          setRandomGif(gifs[randomIndex]);
        }
      } catch (error) {
        console.error('Failed to load gifs:', error);
      }
    };
    loadRandomGif();

    window.electron.onLineImportProgress((data) => {
      setImportProgress(data);
    });
  }, []);

  const handleSliceImage = async () => {
    const filePaths = await window.electron.selectFiles();
    if (filePaths && filePaths.length > 0) {
      const images = await Promise.all(
        filePaths.map(async (filePath) => {
          const base64Data = await window.electron.readImageAsBase64(filePath);
          return {
            id: generateImageId(),
            path: filePath,
            data: base64Data,
            settings: { rows: 1, columns: 1 },
          };
        })
      );
      console.log('[HomePage] Created images with IDs:', images.map(i => i.id));
      dispatch(addImages(images));
      dispatch(navigateTo('EDITOR'));
    }
  };

  const handleLineImport = async (url: string) => {
    setIsImporting(true);
    setImportProgress({ current: 0, total: 0 });
    try {
      const result = await window.electron.importLineStickers(url);
      if (result.success && result.filePaths) {
        const images = await Promise.all(
          result.filePaths.map(async (filePath) => {
            const base64Data = await window.electron.readImageAsBase64(filePath);
            return {
              id: generateImageId(),
              path: filePath,
              data: base64Data,
              settings: { rows: 1, columns: 1 },
            };
          })
        );
        dispatch(addImages(images));
        setShowLineDialog(false);
        dispatch(navigateTo('EDITOR'));
      } else {
        alert(result.error || 'Ошибка импорта');
        setShowLineDialog(false);
      }
    } catch (error) {
      alert('Ошибка импорта стикеров');
      setShowLineDialog(false);
    } finally {
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0 });
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
      </div>
      <div className={styles.actions}>
        <Button icon={<PlusIcon width={18} height={18} />} onClick={handleSliceImage}>
          Создать пак
        </Button>
        <Button variant="secondary" icon={<DownloadIcon width={18} height={18} />} onClick={() => setShowLineDialog(true)} disabled={isImporting}>
          Импорт из LINE
        </Button>
        <Button variant="secondary" icon={<ArchiveIcon width={18} height={18} />} onClick={() => dispatch(navigateTo('LIBRARY'))}>
          Мои стикеры
        </Button>
      </div>
      <ImportLineDialog 
        open={showLineDialog} 
        onOpenChange={setShowLineDialog} 
        onImport={handleLineImport}
        isImporting={isImporting}
        progress={importProgress.total > 0 ? importProgress : undefined}
      />
    </div>
  );
}
