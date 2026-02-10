import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { navigateTo } from '../../app/appSlice';
import { addImages, removeImage, setActiveImage, updateImageSettings, updateGlobalSettings, increaseZoom, decreaseZoom, resetZoom, setOutputFormat, setUpscaleMode, setProcessing, setProgress, resetImage } from './imageSlice';
import { ImageIcon, DownloadIcon, UploadIcon } from '@radix-ui/react-icons';
import { Button, IconButton } from '../../shared/components/ui';
import { ImageCanvas } from './ImageCanvas';
import { CreateTelegramPackDialog } from '../../shared/components/ui/CreateTelegramPackDialog';
import { SaveLocallyDialog } from '../../shared/components/ui/SaveLocallyDialog';
import styles from './ImageEditor.module.scss';
import { useEffect, useState } from 'react';
import uniqueid from 'uniqueid';
import type { OutputFormat, UpscaleMode, LocalPack } from '../../../../common/types';

const generateId = uniqueid('img_');
const generatePackId = uniqueid('pack_');

export function ImageEditor() {
  const dispatch = useAppDispatch();
  const { images, activeImageId, zoom, outputFormat, upscaleMode, globalSettings, isProcessing, progress } = useAppSelector((state) => state.image);
  const { presets } = useAppSelector((state) => state.app);
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const [localDialogOpen, setLocalDialogOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<LocalPack | null>(null);

  useEffect(() => {
    const loadEditingContext = async () => {
      const packId = await window.electron.store.get('editingPackId');
      const savedImages = await window.electron.store.get('editingPackImages');
      
      if (packId) {
        const localPacks = await window.electron.store.get('localPacks') || [];
        const pack = localPacks.find((p: LocalPack) => p.id === packId);
        if (pack) {
          setEditingPack(pack);
          dispatch(setOutputFormat(pack.settings.outputFormat));
          dispatch(setUpscaleMode(pack.settings.upscaleMode));
        }
        await window.electron.store.set('editingPackId', null);
      }
      
      if (savedImages && savedImages.length > 0) {
        const newImages = savedImages.map((img: any) => ({
          id: generateId(),
          path: img.path,
          data: img.data,
          settings: { rows: 1, columns: 1 },
        }));
        dispatch(addImages(newImages));
        await window.electron.store.set('editingPackImages', null);
      }
    };
    
    loadEditingContext();
    
    window.electron.onSlicingProgress((data) => {
      dispatch(setProgress(data));
    });
  }, [dispatch]);

  const handleBack = () => {
    dispatch(resetImage());
    if (editingPack) {
      dispatch(navigateTo('PACK_VIEW'));
    } else {
      dispatch(navigateTo('HOME'));
    }
  };

  const handleAddMore = async () => {
    const filePaths = await window.electron.selectFiles();
    if (filePaths && filePaths.length > 0) {
      const newImages = await Promise.all(
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
      dispatch(addImages(newImages));
    }
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;
    
    if (activeImageId === 'all') {
      dispatch(updateGlobalSettings({ rows: preset.rows, columns: preset.columns }));
    } else {
      dispatch(updateImageSettings({ id: activeImageId, settings: { rows: preset.rows, columns: preset.columns } }));
    }
    dispatch(setUpscaleMode(preset.upscaleMode));
    dispatch(setOutputFormat(preset.outputFormat));
  };

  const activeImage = images.find(img => img.id === activeImageId);
  const currentSettings = activeImageId === 'all' ? globalSettings : activeImage?.settings || globalSettings;

  const handleRowsChange = (value: number) => {
    const newRows = Math.max(1, value);
    if (activeImageId === 'all') {
      if (images.some(img => img.settings.rows !== globalSettings.rows || img.settings.columns !== globalSettings.columns)) {
        if (!confirm('Индивидуальные настройки для некоторых изображений будут сброшены. Продолжить?')) return;
      }
      dispatch(updateGlobalSettings({ rows: newRows }));
    } else {
      dispatch(updateImageSettings({ id: activeImageId, settings: { rows: newRows } }));
    }
  };

  const handleColumnsChange = (value: number) => {
    const newColumns = Math.max(1, value);
    if (activeImageId === 'all') {
      if (images.some(img => img.settings.rows !== globalSettings.rows || img.settings.columns !== globalSettings.columns)) {
        if (!confirm('Индивидуальные настройки для некоторых изображений будут сброшены. Продолжить?')) return;
      }
      dispatch(updateGlobalSettings({ columns: newColumns }));
    } else {
      dispatch(updateImageSettings({ id: activeImageId, settings: { columns: newColumns } }));
    }
  };

  const handleTelegramSubmit = async (data: { name: string; slug: string; botId: string }) => {
    setTelegramDialogOpen(false);
    dispatch(setProcessing(true));

    const userDataPath = await window.electron.store.get('userDataPath') || '';
    const packId = generatePackId();
    const packDir = `${userDataPath}/library/${packId}`;

    const slicingResult = await window.electron.startSlicing({
      images: images.map(img => ({ id: img.id, path: img.path, rows: img.settings.rows, columns: img.settings.columns })),
      targetDir: `${packDir}/fragments`,
      outputFormat,
      upscaleMode,
    });

    if (!slicingResult.success) {
      dispatch(setProcessing(false));
      alert(slicingResult.message);
      return;
    }

    const localPack = {
      id: packId,
      name: data.name,
      createdAt: new Date().toISOString(),
      previewPath: `${packDir}/preview.webp`,
      originalImagePath: images[0].path,
      fragmentsDir: `${packDir}/fragments`,
      fragmentCount: slicingResult.filesCreated || 0,
      nextFragmentIndex: slicingResult.filesCreated || 0,
      settings: {
        rows: globalSettings.rows,
        columns: globalSettings.columns,
        outputFormat,
        upscaleMode,
      },
      status: 'local' as const,
      isAnimated: images[0].path.toLowerCase().endsWith('.gif') || images[0].path.toLowerCase().endsWith('.apng'),
    };

    await window.electron.savePack(packId, packDir, images[0].path, localPack);
    const localPacks = await window.electron.store.get('localPacks') || [];
    await window.electron.store.set('localPacks', [...localPacks, localPack]);

    const bots = await window.electron.store.get('bots') || [];
    const bot = bots.find((b: any) => b.id === data.botId);
    
    if (!bot) {
      dispatch(setProcessing(false));
      alert('Пак сохранен локально.\n\nОшибка загрузки в Telegram: Бот не найден');
      dispatch(resetImage());
      dispatch(navigateTo('LIBRARY'));
      return;
    }

    window.electron.onTelegramUploadProgress((uploadData) => {
      const totalSteps = slicingResult.filesCreated || 0;
      const uploadPercent = Math.round((uploadData.current / totalSteps) * 100);
      dispatch(setProgress({ ...progress, percent: uploadPercent, stage: 'converting' }));
    });

    const telegramResult = await window.electron.createTelegramPack({
      packId,
      userId: parseInt(bot.ownerId),
      name: data.slug,
      title: data.name,
      botToken: bot.token,
      botId: data.botId,
      fragmentsDir: `${packDir}/fragments`,
      isVideo: localPack.isAnimated,
      outputFormat,
      emoji: '😀',
    });

    dispatch(setProcessing(false));

    if (telegramResult.success) {
      alert(`Стикерпак создан!\nСсылка: ${telegramResult.packLink}`);
    } else {
      alert(`Пак сохранен локально.\n\nОшибка загрузки в Telegram:\n${telegramResult.error}`);
    }
    
    dispatch(resetImage());
    dispatch(navigateTo('LIBRARY'));
  };

  const handleLocalSubmit = async (name: string) => {
    setLocalDialogOpen(false);
    dispatch(setProcessing(true));

    const userDataPath = await window.electron.store.get('userDataPath') || '';
    const packId = editingPack?.id || generatePackId();
    const packDir = `${userDataPath}/library/${packId}`;

    const result = await window.electron.startSlicing({
      images: images.map(img => ({ id: img.id, path: img.path, rows: img.settings.rows, columns: img.settings.columns })),
      targetDir: `${packDir}/fragments`,
      outputFormat,
      upscaleMode,
      startIndex: editingPack?.nextFragmentIndex || 0,
    });

    dispatch(setProcessing(false));

    if (result.success) {
      if (editingPack) {
        await window.electron.updateManifest(packDir);
        
        const localPacks = await window.electron.store.get('localPacks') || [];
        const updatedPack = {
          ...editingPack,
          fragmentCount: editingPack.fragmentCount + (result.filesCreated || 0),
          nextFragmentIndex: (editingPack.nextFragmentIndex || 0) + (result.filesCreated || 0),
        };
        const updated = localPacks.map((p: LocalPack) => p.id === packId ? updatedPack : p);
        await window.electron.store.set('localPacks', updated);
        await window.electron.store.set('editingPackId', null);
        
        dispatch(resetImage());
        dispatch(navigateTo('PACK_VIEW'));
      } else {
        const localPack = {
          id: packId,
          name,
          createdAt: new Date().toISOString(),
          previewPath: `${packDir}/preview.webp`,
          originalImagePath: images[0].path,
          fragmentsDir: `${packDir}/fragments`,
          fragmentCount: result.filesCreated || 0,
          nextFragmentIndex: result.filesCreated || 0,
          settings: {
            rows: globalSettings.rows,
            columns: globalSettings.columns,
            outputFormat,
            upscaleMode,
          },
          status: 'local' as const,
          isAnimated: images[0].path.toLowerCase().endsWith('.gif') || images[0].path.toLowerCase().endsWith('.apng'),
        };

        await window.electron.savePack(packId, packDir, images[0].path, localPack);
        
        const localPacks = await window.electron.store.get('localPacks') || [];
        await window.electron.store.set('localPacks', [...localPacks, localPack]);
        
        alert('Стикерпак сохранен!');
        dispatch(resetImage());
        dispatch(navigateTo('LIBRARY'));
      }
    } else {
      alert(result.message);
    }
  };

  const handleSaveToExistingPack = async () => {
    if (!editingPack) return;
    
    dispatch(setProcessing(true));

    const userDataPath = await window.electron.store.get('userDataPath') || '';
    const packDir = `${userDataPath}/library/${editingPack.id}`;

    const result = await window.electron.startSlicing({
      images: images.map(img => ({ id: img.id, path: img.path, rows: img.settings.rows, columns: img.settings.columns })),
      targetDir: `${packDir}/fragments`,
      outputFormat,
      upscaleMode,
      startIndex: editingPack.nextFragmentIndex || 0,
    });

    dispatch(setProcessing(false));

    if (result.success) {
      await window.electron.updateManifest(packDir);
      
      const localPacks = await window.electron.store.get('localPacks') || [];
      const updatedPack = {
        ...editingPack,
        fragmentCount: editingPack.fragmentCount + (result.filesCreated || 0),
        nextFragmentIndex: (editingPack.nextFragmentIndex || 0) + (result.filesCreated || 0),
      };
      const updated = localPacks.map((p: LocalPack) => p.id === editingPack.id ? updatedPack : p);
      await window.electron.store.set('localPacks', updated);
      
      dispatch(resetImage());
      dispatch(navigateTo('PACK_VIEW'));
    } else {
      alert(result.message);
    }
  };

  if (images.length === 0) return null;

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <Button variant="ghost" onClick={handleBack}>
          ← Назад
        </Button>

        {presets.length > 0 && !editingPack && (
          <div className={styles.sidebar__section}>
            <label className={styles.sidebar__label}>Пресет</label>
            <select className={styles.select} onChange={(e) => e.target.value && handleApplyPreset(e.target.value)}>
              <option value="">Выберите пресет</option>
              {presets.map(preset => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.sidebar__section}>
          <label className={styles.sidebar__label}>Формат</label>
          <select className={styles.select} value={outputFormat} onChange={(e) => dispatch(setOutputFormat(e.target.value as OutputFormat))} disabled={!!editingPack}>
            <option value="STICKER">Стикерпак (512x512)</option>
            <option value="EMOJI">Эмодзи-пак (100x100)</option>
          </select>
        </div>

        <div className={styles.sidebar__section}>
          <label className={styles.sidebar__label}>Режим апскейлинга</label>
          <select className={styles.select} value={upscaleMode} onChange={(e) => dispatch(setUpscaleMode(e.target.value as UpscaleMode))}>
            <option value="none">Без апскейлера</option>
            <option value="soft">Мягкий (фото/видео)</option>
            <option value="sharp">Четкий (текст/логотипы)</option>
          </select>
        </div>

        <div className={styles.sidebar__section}>
          <label className={styles.sidebar__label}>Строки</label>
          <div className={styles.input}>
            <button className={styles.input__button} onClick={() => handleRowsChange(currentSettings.rows - 1)}>-</button>
            <input type="number" className={styles.input__field} value={currentSettings.rows} onChange={(e) => handleRowsChange(Number(e.target.value))} min={1} />
            <button className={styles.input__button} onClick={() => handleRowsChange(currentSettings.rows + 1)}>+</button>
          </div>
        </div>

        <div className={styles.sidebar__section}>
          <label className={styles.sidebar__label}>Столбцы</label>
          <div className={styles.input}>
            <button className={styles.input__button} onClick={() => handleColumnsChange(currentSettings.columns - 1)}>-</button>
            <input type="number" className={styles.input__field} value={currentSettings.columns} onChange={(e) => handleColumnsChange(Number(e.target.value))} min={1} />
            <button className={styles.input__button} onClick={() => handleColumnsChange(currentSettings.columns + 1)}>+</button>
          </div>
        </div>

        <div className={styles.sidebar__section}>
          <label className={styles.sidebar__label}>Масштаб: {zoom.toFixed(1)}x</label>
          <div className={styles.input}>
            <button className={styles.input__button} onClick={() => dispatch(decreaseZoom())}>-</button>
            <button className={styles.input__button} onClick={() => dispatch(increaseZoom())}>+</button>
            <button className={styles.input__button} onClick={() => dispatch(resetZoom())}>↺</button>
          </div>
        </div>

        <Button variant="secondary" icon={<ImageIcon width={18} height={18} />} onClick={handleAddMore}>
          Добавить еще
        </Button>

        <div className={styles.sidebar__spacer} />

        {isProcessing && (
          <div className={styles.progressInfo}>
            <div>Обработка: {progress.percent}%</div>
          </div>
        )}

        <div className={styles.buttonGroup}>
          <Button 
            icon={<UploadIcon width={18} height={18} />}
            onClick={() => editingPack ? handleSaveToExistingPack() : setTelegramDialogOpen(true)} 
            disabled={isProcessing}
          >
            {editingPack ? 'Сохранить' : 'Создать пак в Telegram'}
          </Button>
          {!editingPack && (
            <IconButton 
              icon={<DownloadIcon width={18} height={18} />}
              onClick={() => setLocalDialogOpen(true)}
              disabled={isProcessing}
              title="Сохранить локально"
            />
          )}
        </div>
      </aside>

      <div className={styles.mainContent}>
        <div className={styles.workspace}>
          <ImageCanvas imageData={activeImage?.data || images[0]?.data || ''} rows={currentSettings.rows} columns={currentSettings.columns} zoom={zoom} />
        </div>
        
        {images.length > 1 && (
          <div className={styles.gallerySection}>
            <div className={styles.gallery}>
              <div className={`${styles.galleryItem} ${activeImageId === 'all' ? styles.active : ''}`} onClick={() => dispatch(setActiveImage('all'))}>
                <div className={styles.galleryAll}>Все</div>
              </div>
              {images.map(img => (
                <div key={img.id} className={`${styles.galleryItem} ${activeImageId === img.id ? styles.active : ''}`}>
                  <button className={styles.galleryRemove} onClick={(e) => { e.stopPropagation(); dispatch(removeImage(img.id)); }}>×</button>
                  <img src={img.data} alt="" className={styles.galleryThumb} onClick={() => dispatch(setActiveImage(img.id))} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <CreateTelegramPackDialog 
        open={telegramDialogOpen} 
        onOpenChange={setTelegramDialogOpen}
        onSubmit={handleTelegramSubmit}
      />

      <SaveLocallyDialog
        open={localDialogOpen}
        onOpenChange={setLocalDialogOpen}
        onSubmit={handleLocalSubmit}
      />
    </div>
  );
}
