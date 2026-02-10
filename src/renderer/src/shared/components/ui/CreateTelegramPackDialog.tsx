import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Cross2Icon, RocketIcon } from '@radix-ui/react-icons';
import { useAppSelector } from '../../../app/hooks';
import { Button } from './Button';
import { IconButton } from './IconButton';
import styles from './CreateTelegramPackDialog.module.scss';

interface CreateTelegramPackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; slug: string; botId: string }) => void;
  defaultName?: string;
}

function transliterate(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
    'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  return text.toLowerCase().split('').map(char => map[char] || char).join('');
}

export function CreateTelegramPackDialog({ open, onOpenChange, onSubmit, defaultName }: CreateTelegramPackDialogProps) {
  const { bots, selectedBotId } = useAppSelector((state) => state.app);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [botId, setBotId] = useState(selectedBotId || bots[0]?.id || '');
  const [isSlugManual, setIsSlugManual] = useState(false);

  useEffect(() => {
    if (open && defaultName) {
      setName(defaultName);
    }
  }, [open, defaultName]);

  useEffect(() => {
    if (!isSlugManual && name) {
      const bot = bots.find(b => b.id === botId);
      const botName = bot?.name.toLowerCase().replace(/\s+/g, '_') || 'bot';
      const hash = Math.random().toString(36).substring(2, 8);
      const translitName = transliterate(name).replace(/[^a-z0-9]/g, '_');
      setSlug(`${translitName}_${hash}_${botName}`);
    }
  }, [name, botId, isSlugManual, bots]);

  const handleSubmit = () => {
    if (!name.trim() || !slug.trim() || !botId) return;
    onSubmit({ name: name.trim(), slug: slug.trim(), botId });
    setName('');
    setSlug('');
    setIsSlugManual(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              <RocketIcon width={20} height={20} />
              Создать пак в Telegram
            </Dialog.Title>
            <IconButton 
              variant="ghost"
              icon={<Cross2Icon width={18} height={18} />}
              onClick={() => onOpenChange(false)}
            />
          </div>
          
          <div className={styles.field}>
            <label className={styles.label}>Название пака</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Мой стикерпак"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>ID пака (slug)</label>
            <input
              className={styles.input}
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setIsSlugManual(true);
              }}
              placeholder="my_pack_abc123_bot"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Бот</label>
            <select className={styles.select} value={botId} onChange={(e) => setBotId(e.target.value)}>
              {bots.map(bot => (
                <option key={bot.id} value={bot.id}>{bot.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button icon={<RocketIcon width={18} height={18} />} onClick={handleSubmit}>
              Начать загрузку
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
