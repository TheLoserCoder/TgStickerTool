import { useState } from 'react';
import { useAppDispatch } from '../../app/hooks';
import { addBot, navigateTo } from '../../app/appSlice';
import { Button } from '../../shared/components/ui';
import uniqueid from 'uniqueid';
import styles from './AddBotPage.module.scss';

const generateBotId = uniqueid('bot_');

export function AddBotPage() {
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [ownerId, setOwnerId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !token.trim() || !ownerId.trim()) return;

    const bot = { id: generateBotId(), name: name.trim(), token: token.trim(), ownerId: ownerId.trim() };
    dispatch(addBot(bot));
    
    const bots = await window.electron.store.get('bots') || [];
    await window.electron.store.set('bots', [...bots, bot]);
    await window.electron.store.set('selectedBotId', bot.id);
    
    dispatch(navigateTo('HOME'));
  };

  const handleOpenUserInfoBot = () => {
    window.open('https://t.me/userinfobot', '_blank');
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Добавить бота</h1>
        <p className={styles.subtitle}>Получите токен у @BotFather в Telegram</p>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Имя бота</label>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Мой стикер-бот"
              required
            />
          </div>
          
          <div className={styles.field}>
            <label className={styles.label}>Токен</label>
            <input
              type="text"
              className={styles.input}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Telegram User ID</label>
            <input
              type="text"
              className={styles.input}
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              placeholder="123456789"
              required
            />
            <p className={styles.helper}>
              Бот создаёт паки от имени пользователя. Чтобы узнать свой ID, отправьте любое сообщение боту{' '}
              <button type="button" className={styles.link} onClick={handleOpenUserInfoBot}>@userinfobot</button>
            </p>
          </div>
          
          <Button type="submit">
            Добавить
          </Button>
        </form>
      </div>
    </div>
  );
}
