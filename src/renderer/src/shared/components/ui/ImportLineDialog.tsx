import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Progress from '@radix-ui/react-progress';
import { Cross2Icon } from '@radix-ui/react-icons';
import { Button } from './Button';
import styles from './ImportLineDialog.module.scss';

interface ImportLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (url: string) => void;
  isImporting?: boolean;
  progress?: { current: number; total: number };
}

export function ImportLineDialog({ open, onOpenChange, onImport, isImporting = false, progress }: ImportLineDialogProps) {
  const [url, setUrl] = useState('');

  const handleImport = () => {
    if (url.trim() && !isImporting) {
      onImport(url.trim());
      setUrl('');
    }
  };

  const handleClose = () => {
    if (!isImporting) {
      onOpenChange(false);
      setUrl('');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={isImporting ? undefined : onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>Импорт из LINE</Dialog.Title>
          <Dialog.Description className={styles.description}>
            {isImporting ? 'Загрузка стикеров...' : 'Вставьте ссылку на набор стикеров LINE'}
          </Dialog.Description>
          
          {!isImporting ? (
            <>
              <div className={styles.form}>
                <input
                  type="text"
                  placeholder="https://store.line.me/stickershop/product/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleImport()}
                  className={styles.input}
                />
              </div>

              <div className={styles.actions}>
                <Button variant="secondary" onClick={handleClose}>
                  Отмена
                </Button>
                <Button onClick={handleImport} disabled={!url.trim()}>
                  Импортировать
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.progressSection}>
              {progress && (
                <>
                  <div className={styles.progressText}>
                    Загружено: {progress.current} из {progress.total}
                  </div>
                  <Progress.Root className={styles.progressRoot} value={(progress.current / progress.total) * 100}>
                    <Progress.Indicator 
                      className={styles.progressIndicator} 
                      style={{ transform: `translateX(-${100 - (progress.current / progress.total) * 100}%)` }}
                    />
                  </Progress.Root>
                </>
              )}
            </div>
          )}

          {!isImporting && (
            <Dialog.Close asChild>
              <button className={styles.closeButton} aria-label="Close">
                <Cross2Icon />
              </button>
            </Dialog.Close>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
