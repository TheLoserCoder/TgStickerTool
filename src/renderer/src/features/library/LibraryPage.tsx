import { useEffect, useState } from 'react';
import { useAppDispatch } from '../../app/hooks';
import { navigateTo, setCurrentPack } from '../../app/appSlice';
import { FileIcon, TrashIcon } from '@radix-ui/react-icons';
import { Button, IconButton } from '../../shared/components/ui';
import type { LocalPack } from '../../../../common/types';
import styles from './LibraryPage.module.scss';

export function LibraryPage() {
  const dispatch = useAppDispatch();
  const [packs, setPacks] = useState<LocalPack[]>([]);
  const [previewFragments, setPreviewFragments] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const loadPacks = async () => {
      const localPacks = await window.electron.store.get('localPacks') || [];
      setPacks(localPacks);
      
      const userDataPath = await window.electron.store.get('userDataPath') as string;
      const previews: Record<string, string[]> = {};
      
      for (const pack of localPacks) {
        if (pack.fragmentsDir) {
          const frags = await window.electron.getFragments(pack.fragmentsDir);
          const cols = pack.settings.outputFormat === 'EMOJI' ? 8 : 5;
          const previewCount = Math.min(frags.length, cols * 4);
          const previewFrags = frags.slice(0, previewCount).map(f => {
            const relativePath = f.replace(userDataPath, '').replace(/\\/g, '/').replace(/^\//, '');
            return `local-file://${relativePath}`;
          });
          previews[pack.id] = previewFrags;
        }
      }
      
      setPreviewFragments(previews);
    };
    loadPacks();
  }, []);

  const handleBack = () => dispatch(navigateTo('HOME'));

  const handleOpenPack = (pack: LocalPack) => {
    dispatch(setCurrentPack(pack.id));
    dispatch(navigateTo('PACK_VIEW'));
  };

  const handleDeletePack = async (pack: LocalPack, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Удалить стикерпак "${pack.name}"?`)) return;
    
    const packDir = pack.fragmentsDir?.replace('/fragments', '') || '';
    if (!packDir) return;
    
    await window.electron.deletePack(pack.id, packDir);
    const localPacks = await window.electron.store.get('localPacks') || [];
    await window.electron.store.set('localPacks', localPacks.filter((p: LocalPack) => p.id !== pack.id));
    setPacks(localPacks.filter((p: LocalPack) => p.id !== pack.id));
  };

  const handleOpenFolder = (pack: LocalPack, e: React.MouseEvent) => {
    e.stopPropagation();
    const packDir = pack.fragmentsDir?.replace('/fragments', '') || '';
    if (!packDir) return;
    window.electron.openFolder(packDir);
  };

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <Button variant="ghost" onClick={handleBack}>← Назад</Button>
        <h2 className={styles.sidebarTitle}>Мои стикеры</h2>
      </aside>

      <div className={styles.content}>
        <h1 className={styles.title}>Библиотека стикерпаков</h1>
        
        {packs.length === 0 ? (
          <div className={styles.empty}>
            <p>У вас пока нет сохраненных стикерпаков</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {packs.map(pack => {
              const cols = pack.settings.outputFormat === 'EMOJI' ? 8 : 5;
              return (
              <div key={pack.id} className={styles.card} onClick={() => handleOpenPack(pack)}>
                <div className={styles.preview} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                  {previewFragments[pack.id]?.map((frag, idx) => (
                    <div key={idx} className={styles.previewItem}>
                      {frag.endsWith('.webm') ? (
                        <video src={frag} autoPlay loop muted />
                      ) : (
                        <img src={frag} alt="" />
                      )}
                    </div>
                  ))}
                </div>
                <div className={styles.info}>
                  <div className={styles.badge}>{pack.status === 'local' ? 'Локальный' : 'В Telegram'}</div>
                  <h3 className={styles.packName}>{pack.name}</h3>
                  <p className={styles.packDate}>
                    {new Date(pack.createdAt).toLocaleDateString('ru-RU')}
                  </p>
                  <p className={styles.packDetails}>
                    {pack.settings.outputFormat === 'EMOJI' ? 'Эмодзи' : 'Стикеры'} • {pack.fragmentCount} файлов
                  </p>
                </div>
                <div className={styles.actions}>
                  <IconButton 
                    variant="secondary"
                    icon={<FileIcon width={18} height={18} />}
                    onClick={(e) => handleOpenFolder(pack, e)} 
                    title="Открыть папку"
                  />
                  <IconButton 
                    variant="danger"
                    icon={<TrashIcon width={18} height={18} />}
                    onClick={(e) => handleDeletePack(pack, e)} 
                    title="Удалить"
                  />
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
