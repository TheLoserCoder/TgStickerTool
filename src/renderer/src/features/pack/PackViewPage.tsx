import { useEffect, useState } from 'react';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { UpdateIcon, UploadIcon, ImageIcon, Link2Icon } from '@radix-ui/react-icons';
import { Button } from '../../shared/components/ui';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { navigateTo } from '../../app/appSlice';
import { CreateTelegramPackDialog } from '../../shared/components/ui/CreateTelegramPackDialog';
import { SortableItem } from './SortableGrid';
import type { LocalPack, TelegramUploadProgress } from '../../../../common/types';
import styles from './PackViewPage.module.scss';

import { addImages } from '../image/imageSlice';

let imageIdCounter = 0;
const generateImageId = () => `img_${Date.now()}_${imageIdCounter++}`;

export function PackViewPage() {
  const dispatch = useAppDispatch();
  const { currentPackId } = useAppSelector((state) => state.app);
  const [pack, setPack] = useState<LocalPack | null>(null);
  const [fragments, setFragments] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<TelegramUploadProgress | null>(null);
  const [uploadedFragments, setUploadedFragments] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [fragmentItems, setFragmentItems] = useState<Array<{ id: string; path: string }>>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );



  useEffect(() => {
    const progressHandler = (data: TelegramUploadProgress) => {
      setUploadProgress(data);
    };

    const completeHandler = async (data: any) => {
      setIsUploading(false);
      setUploadProgress(null);
      
      if (data.success) {
        alert(`Стикерпак загружен!\nСсылка: ${data.packLink}`);
        await loadPackData();
      } else if (data.error) {
        alert(`Ошибка: ${data.error}`);
      }
    };

    window.electron.onTelegramUploadProgress(progressHandler);
    window.electron.onTelegramUploadComplete(completeHandler);
  }, [pack]);

  const loadPackData = async () => {
    if (!currentPackId) return;
    const localPacks = await window.electron.store.get('localPacks') || [];
    const foundPack = localPacks.find((p: LocalPack) => p.id === currentPackId);
    if (foundPack) {
      setPack(foundPack);
      setName(foundPack.name);
      if (foundPack.fragmentsDir) {
        const packDir = foundPack.fragmentsDir.replace('/fragments', '');
        const manifest = await window.electron.getManifest(packDir);
        
        const frags = await window.electron.getFragments(foundPack.fragmentsDir);
        console.log('Loaded fragments:', frags);
        const userDataPath = await window.electron.store.get('userDataPath') as string;
        const localFrags = frags.map(f => {
          const relativePath = f.replace(userDataPath, '').replace(/\\/g, '/').replace(/^\//, '');
          return `local-file://${relativePath}`;
        });
        setFragments(localFrags);
        
        const items = localFrags.map((fragPath, idx) => {
          return { id: `item-${idx}`, path: fragPath };
        });
        setFragmentItems(items);
        
        if (manifest) {
          const uploaded = new Set(
            manifest.fragments
              .filter((f: any) => f.status === 'uploaded')
              .map((f: any) => f.fileName)
          );
          setUploadedFragments(uploaded);
          console.log('Loaded manifest:', uploaded.size, 'uploaded fragments');
        }
      }
    }
  };

  useEffect(() => {
    loadPackData();
  }, [currentPackId]);

  useEffect(() => {
    const checkReload = async () => {
      const shouldReload = await window.electron.store.get('shouldReloadPack');
      if (shouldReload) {
        await window.electron.store.set('shouldReloadPack', false);
        await loadPackData();
      }
    };
    checkReload();
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;
    
    const oldIndex = fragmentItems.findIndex(item => item.id === active.id);
    const newIndex = fragmentItems.findIndex(item => item.id === over.id);
    const newItems = arrayMove(fragmentItems, oldIndex, newIndex);
    
    setFragmentItems(newItems);
    setFragments(newItems.map(item => item.path));
    
    if (pack) {
      const packDir = pack.fragmentsDir.replace('/fragments', '');
      const newOrder = newItems.map(item => item.path.split('/').pop() || '');
      console.log('[PackView] Updating order in manifest:', newOrder);
      await window.electron.updateFragmentOrder(packDir, newOrder);
    }
  };

  const handleBack = () => dispatch(navigateTo('LIBRARY'));

  const handleSaveName = async () => {
    if (!pack) return;
    const updatedPack = { ...pack, name };
    const localPacks = await window.electron.store.get('localPacks') || [];
    const updated = localPacks.map((p: LocalPack) => p.id === pack.id ? updatedPack : p);
    await window.electron.store.set('localPacks', updated);
    setPack(updatedPack);
  };

  const handleAddMore = async () => {
    const filePaths = await window.electron.selectFiles();
    if (filePaths && filePaths.length > 0 && pack) {
      await window.electron.store.set('editingPackId', pack.id);
      
      const newImages = await Promise.all(
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
      
      dispatch(addImages(newImages));
      dispatch(navigateTo('EDITOR'));
    }
  };

  const handleUploadToTelegram = async (data?: { name: string; slug: string; botId: string }) => {
    if (!pack) return;
    
    const localPacks = await window.electron.store.get('localPacks') || [];
    const currentPack = localPacks.find((p: LocalPack) => p.id === pack.id);
    if (!currentPack) {
      alert('Пак не найден');
      return;
    }

    const isUpdate = currentPack.status === 'telegram' && currentPack.tgBotId && currentPack.tgUserId;
    
    if (!isUpdate && !data) {
      setUploadDialogOpen(true);
      return;
    }
    
    setUploadDialogOpen(false);
    
    setIsUploading(true);
    setUploadProgress({ current: 0, total: fragments.length, percent: 0, stage: 'creating', message: 'Начало загрузки...' });

    const bots = await window.electron.store.get('bots') || [];
    
    let bot, userId;
    if (isUpdate) {
      bot = bots.find((b: any) => b.id === currentPack.tgBotId);
      userId = currentPack.tgUserId;
    } else {
      bot = bots.find((b: any) => b.id === data!.botId);
      userId = parseInt(bot?.ownerId || '0');
    }
    
    if (!bot) {
      setIsUploading(false);
      setUploadProgress(null);
      alert('Бот не найден');
      return;
    }

    const actualFragments = await window.electron.getFragments(currentPack.fragmentsDir);
    const actualFileNames = actualFragments.map(f => f.split('/').pop() || f.split('\\').pop() || '');
    
    console.log('[PackView] Actual files in folder:', actualFileNames.length, actualFileNames);

    const packDir = currentPack.fragmentsDir.replace('/fragments', '');
    const manifest = await window.electron.getManifest(packDir);
    
    const manifestFileNames = manifest?.fragments.map((f: any) => f.fileName) || [];
    const uploadedFileNames = manifest?.fragments.filter((f: any) => f.status === 'uploaded').map((f: any) => f.fileName) || [];
    
    console.log('[PackView] Files in manifest:', manifestFileNames.length, manifestFileNames);
    console.log('[PackView] Uploaded in manifest:', uploadedFileNames.length, uploadedFileNames);
    
    const deletedFiles = uploadedFileNames.filter(f => !actualFileNames.includes(f));
    const newFiles = actualFileNames.filter(f => !manifestFileNames.includes(f));
    const pendingFiles = manifestFileNames.filter(f => !uploadedFileNames.includes(f) && actualFileNames.includes(f));
    const filesToUpload = [...new Set([...newFiles, ...pendingFiles])];
    
    console.log('[PackView] Deleted files:', deletedFiles.length, deletedFiles);
    console.log('[PackView] New files not in manifest:', newFiles.length, newFiles);
    console.log('[PackView] Pending files:', pendingFiles.length, pendingFiles);
    console.log('[PackView] Total files to upload:', filesToUpload.length);
    
    const hasChanges = filesToUpload.length > 0 || deletedFiles.length > 0;
    const hasReorder = manifest?.pendingReorder && manifest?.order;
    const hasTitleChange = isUpdate && currentPack.tgLink && name !== pack.name;
    
    if (isUpdate && !hasChanges && !hasReorder && !hasTitleChange) {
      setIsUploading(false);
      setUploadProgress(null);
      alert('Нет изменений для обновления');
      return;
    }

    const packName = isUpdate && currentPack.tgLink ? 
      currentPack.tgLink.split('/').pop() : data!.slug;

    // Выполняем обновление (удаления, добавления, заголовок)
    const telegramResult = await window.electron.createTelegramPack({
      packId: currentPack.id,
      userId,
      name: packName || data!.slug,
      title: isUpdate ? name : data!.name,
      botToken: bot.token,
      botId: bot.id,
      fragmentsDir: currentPack.fragmentsDir,
      isVideo: currentPack.isAnimated,
      outputFormat: currentPack.settings.outputFormat,
      emoji: '😀',
      deletedFiles: deletedFiles,
    });

    if (!telegramResult.success) {
      setIsUploading(false);
      setUploadProgress(null);
      alert(`Ошибка загрузки в Telegram:\n${telegramResult.error}`);
      return;
    }

    // После успешного обновления выполняем перемещение если нужно
    if (isUpdate && hasReorder) {
      setUploadProgress({ current: 1, total: 1, percent: 100, stage: 'uploading', message: 'Синхронизация порядка стикеров...' });
      
      console.log('[PackView] Calling reorderStickers with order:', manifest.order);
      const reorderResult = await window.electron.reorderStickers(packDir, bot.token, manifest.order);
      console.log('[PackView] Reorder result:', reorderResult);
      
      if (reorderResult.success) {
        await loadPackData();
        setIsUploading(false);
        setUploadProgress(null);
        alert(`Обновление завершено! Перемещено стикеров: ${reorderResult.moved || 0}`);
      } else {
        setIsUploading(false);
        setUploadProgress(null);
        alert(`Обновлено, но ошибка изменения порядка: ${reorderResult.error}`);
      }
    } else {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteFragment = async (fragmentPath: string) => {
    if (!pack) return;
    
    const fileName = fragmentPath.split('/').pop() || '';
    if (!confirm(`Удалить фрагмент ${fileName}?`)) return;
    
    // Удаляем файл
    const userDataPath = await window.electron.store.get('userDataPath') as string;
    const fullPath = fragmentPath.replace('local-file://', '').replace(/^\//g, '');
    const absolutePath = `${userDataPath}/${fullPath}`;
    
    try {
      await window.electron.deleteFragment(absolutePath);
      await loadPackData();
    } catch (error) {
      alert('Ошибка при удалении фрагмента');
    }
  };

  const handleCopyLink = () => {
    if (pack?.tgLink) {
      navigator.clipboard.writeText(pack.tgLink);
      alert('Ссылка скопирована!');
    }
  };

  const handleSync = async () => {
    if (!pack || pack.status !== 'telegram') return;
    
    setIsSyncing(true);
    const bots = await window.electron.store.get('bots') || [];
    const bot = bots.find((b: any) => b.id === pack.tgBotId);
    
    if (!bot) {
      alert('Бот не найден');
      setIsSyncing(false);
      return;
    }
    
    const packDir = pack.fragmentsDir.replace('/fragments', '');
    const result = await window.electron.syncPackWithTelegram(packDir, bot.token);
    
    setIsSyncing(false);
    
    if (result.success) {
      await loadPackData();
      const msg = result.downloaded > 0 
        ? `Синхронизация завершена! Скачано ${result.downloaded} стикеров из Telegram.`
        : 'Синхронизация завершена!';
      alert(msg);
    } else {
      alert(`Ошибка синхронизации: ${result.error}`);
    }
  };

  if (!pack) return null;

  const gridCols = pack.settings.outputFormat === 'EMOJI' ? 8 : 5;

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <Button variant="ghost" onClick={handleBack}>← Назад</Button>
        
        <div className={styles.section}>
          <label className={styles.label}>Название</label>
          <input 
            className={styles.input} 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSaveName}
          />
        </div>

        <Button variant="secondary" icon={<ImageIcon width={18} height={18} />} onClick={handleAddMore}>
          Добавить
        </Button>

        {pack.status === 'telegram' && pack.tgLink && (
          <>
            <Button variant="secondary" icon={<Link2Icon width={18} height={18} />} onClick={handleCopyLink}>
              Скопировать ссылку
            </Button>
            <Button 
              icon={<UpdateIcon width={18} height={18} className={isSyncing ? 'spinning' : ''} />}
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? 'Синхронизация...' : 'Синхронизировать'}
            </Button>
          </>
        )}

        {pack.status === 'local' ? (
          <>
            <Button 
              icon={<UploadIcon width={18} height={18} />}
              onClick={() => setUploadDialogOpen(true)} 
              disabled={isUploading}
            >
              {isUploading ? 'Загрузка...' : 'Загрузить в Telegram'}
            </Button>
          </>
        ) : (
          <Button 
            icon={<UpdateIcon width={18} height={18} />}
            onClick={() => handleUploadToTelegram()} 
            disabled={isUploading}
          >
            {isUploading ? 'Обновление...' : 'Обновить'}
          </Button>
        )}
        
        {uploadProgress && (
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill} 
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
            <div className={styles.progressText}>{uploadProgress.message}</div>
          </div>
        )}
      </aside>

      <div className={styles.content}>
        {fragmentItems.length === 0 ? (
          <div className={styles.empty}>Фрагменты не найдены</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fragmentItems.map(f => f.id)} strategy={rectSortingStrategy}>
              <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
                {fragmentItems.map((item) => {
                  const fileName = item.path.split('/').pop() || '';
                  const isUploaded = uploadedFragments.has(fileName);
                  
                  return (
                    <SortableItem
                      key={item.id}
                      id={item.id}
                      fragmentPath={item.path}
                      isUploaded={isUploaded}
                      onDelete={handleDeleteFragment}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <CreateTelegramPackDialog 
        open={uploadDialogOpen} 
        onOpenChange={setUploadDialogOpen}
        onSubmit={handleUploadToTelegram}
        defaultName={pack?.name}
      />
    </div>
  );
}
