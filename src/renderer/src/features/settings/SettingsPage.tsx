import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { navigateTo, removeBot, updateBot, addPreset, removePreset } from '../../app/appSlice';
import { PlusIcon, TrashIcon } from '@radix-ui/react-icons';
import { Button, IconButton } from '../../shared/components/ui';
import uniqueid from 'uniqueid';
import styles from './SettingsPage.module.scss';
import type { Bot, Preset } from '../../../../common/types';

const generatePresetId = uniqueid('preset_');

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const { bots, presets } = useAppSelector((state) => state.app);
  const [tab, setTab] = useState<'bots' | 'presets'>('bots');
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [presetName, setPresetName] = useState('');
  const [presetRows, setPresetRows] = useState(1);
  const [presetCols, setPresetCols] = useState(1);
  const [presetMode, setPresetMode] = useState<'soft' | 'sharp'>('soft');
  const [presetDownscaleMode, setPresetDownscaleMode] = useState<'none' | 'highQuality'>('none');
  const [presetFormat, setPresetFormat] = useState<'STICKER' | 'EMOJI'>('STICKER');
  const [presetAnimation, setPresetAnimation] = useState(true);

  const handleBack = () => dispatch(navigateTo('HOME'));

  const handleSaveBot = async () => {
    if (!editingBot) return;
    dispatch(updateBot(editingBot));
    await window.electron.store.set('bots', bots.map(b => b.id === editingBot.id ? editingBot : b));
    setEditingBot(null);
  };

  const handleDeleteBot = async (id: string) => {
    if (!confirm('Удалить бота?')) return;
    dispatch(removeBot(id));
    await window.electron.store.set('bots', bots.filter(b => b.id !== id));
  };

  const handleAddPreset = async () => {
    if (!presetName.trim()) return;
    const preset: Preset = {
      id: generatePresetId(),
      name: presetName.trim(),
      rows: presetRows,
      columns: presetCols,
      upscaleMode: presetMode,
      downscaleMode: presetDownscaleMode,
      outputFormat: presetFormat,
      preserveAnimation: presetAnimation,
    };
    dispatch(addPreset(preset));
    await window.electron.store.set('presets', [...presets, preset]);
    setPresetName('');
  };

  const handleDeletePreset = async (id: string) => {
    dispatch(removePreset(id));
    await window.electron.store.set('presets', presets.filter(p => p.id !== id));
  };

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <Button variant="ghost" onClick={handleBack}>← Назад</Button>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'bots' ? styles.active : ''}`} onClick={() => setTab('bots')}>
            Боты
          </button>
          <button className={`${styles.tab} ${tab === 'presets' ? styles.active : ''}`} onClick={() => setTab('presets')}>
            Пресеты
          </button>
        </div>
      </aside>

      <div className={styles.content}>
        {tab === 'bots' && (
          <div className={styles.section}>
            <h2 className={styles.title}>Управление ботами</h2>
            <Button 
              icon={<PlusIcon width={18} height={18} />}
              onClick={() => dispatch(navigateTo('ADD_BOT'))}
              className={styles.addButton}
            >
              Добавить бота
            </Button>
            {bots.map(bot => (
              <div key={bot.id} className={styles.botCard}>
                {editingBot?.id === bot.id ? (
                  <>
                    <input
                      className={styles.input}
                      placeholder="Имя бота"
                      value={editingBot.name}
                      onChange={(e) => setEditingBot({ ...editingBot, name: e.target.value })}
                    />
                    <input
                      className={styles.input}
                      placeholder="Токен"
                      value={editingBot.token}
                      onChange={(e) => setEditingBot({ ...editingBot, token: e.target.value })}
                    />
                    <input
                      className={styles.input}
                      placeholder="User ID"
                      value={editingBot.ownerId}
                      onChange={(e) => setEditingBot({ ...editingBot, ownerId: e.target.value })}
                    />
                    <Button onClick={handleSaveBot}>Сохранить</Button>
                  </>
                ) : (
                  <>
                    <div className={styles.botInfo}>
                      <div className={styles.botName}>{bot.name}</div>
                      <div className={styles.botToken}>{bot.token.slice(0, 20)}...</div>
                      <div className={styles.botOwnerId}>User ID: {bot.ownerId}</div>
                    </div>
                    <Button variant="secondary" onClick={() => setEditingBot(bot)}>Изменить</Button>
                    <IconButton 
                      variant="danger"
                      icon={<TrashIcon width={15} height={15} />}
                      onClick={() => handleDeleteBot(bot.id)}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'presets' && (
          <div className={styles.section}>
            <h2 className={styles.title}>Пресеты нарезки</h2>
            <div className={styles.presetForm}>
              <label className={styles.label}>Название</label>
              <input
                className={styles.input}
                placeholder="Название пресета"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <label className={styles.label}>Строки</label>
              <input
                type="number"
                className={styles.inputSmall}
                value={presetRows}
                onChange={(e) => setPresetRows(Number(e.target.value))}
                min={1}
              />
              <label className={styles.label}>Столбцы</label>
              <input
                type="number"
                className={styles.inputSmall}
                value={presetCols}
                onChange={(e) => setPresetCols(Number(e.target.value))}
                min={1}
              />
              <label className={styles.label}>Режим апскейлинга</label>
              <select className={styles.select} value={presetMode} onChange={(e) => setPresetMode(e.target.value as any)}>
                <option value="none">Без апскейлера</option>
                <option value="soft">Мягкий</option>
                <option value="sharp">Четкий</option>
              </select>
              <label className={styles.label}>Режим уменьшения</label>
              <select className={styles.select} value={presetDownscaleMode} onChange={(e) => setPresetDownscaleMode(e.target.value as any)}>
                <option value="none">Без обработки</option>
                <option value="highQuality">High Quality (Lanczos)</option>
              </select>
              <label className={styles.label}>Тип пака</label>
              <select className={styles.select} value={presetFormat} onChange={(e) => setPresetFormat(e.target.value as any)}>
                <option value="STICKER">Стикерпак (512x512)</option>
                <option value="EMOJI">Эмодзи-пак (100x100)</option>
              </select>
              <label className={styles.label}>Анимация</label>
              <select className={styles.select} value={presetAnimation ? 'yes' : 'no'} onChange={(e) => setPresetAnimation(e.target.value === 'yes')}>
                <option value="yes">Сохранить (видео)</option>
                <option value="no">Убрать (webp)</option>
              </select>
              <Button onClick={handleAddPreset}>Добавить</Button>
            </div>
            <div className={styles.presetList}>
              {presets.map(preset => (
                <div key={preset.id} className={styles.presetCard}>
                  <div className={styles.presetName}>{preset.name}</div>
                  <div className={styles.presetDetails}>
                    {preset.rows}x{preset.columns} • {preset.upscaleMode === 'none' ? 'Без апскейлера' : preset.upscaleMode === 'soft' ? 'Мягкий' : 'Четкий'} • {preset.downscaleMode === 'highQuality' ? 'HQ' : 'Стандарт'} • {preset.outputFormat === 'STICKER' ? 'Стикер' : 'Эмодзи'} • {preset.preserveAnimation ? 'Аним.' : 'Статика'}
                  </div>
                  <IconButton 
                    variant="danger"
                    icon={<TrashIcon width={15} height={15} />}
                    onClick={() => handleDeletePreset(preset.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
