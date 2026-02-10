import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Cross2Icon, DownloadIcon } from '@radix-ui/react-icons';
import { Button } from './Button';
import { IconButton } from './IconButton';
import styles from './SaveLocallyDialog.module.scss';

interface SaveLocallyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}

export function SaveLocallyDialog({ open, onOpenChange, onSubmit }: SaveLocallyDialogProps) {
  const [name, setName] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim());
    setName('');
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              <DownloadIcon width={20} height={20} />
              Сохранить локально
            </Dialog.Title>
            <IconButton 
              variant="ghost"
              icon={<Cross2Icon width={18} height={18} />}
              onClick={() => onOpenChange(false)}
            />
          </div>
          
          <div className={styles.field}>
            <label className={styles.label}>Название набора</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Мой набор стикеров"
            />
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button icon={<DownloadIcon width={18} height={18} />} onClick={handleSubmit}>
              Сохранить
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
