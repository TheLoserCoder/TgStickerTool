import { useState } from 'react';
import { Modal } from '../../shared/components/ui';
import styles from './MainPage.module.scss';

export function MainPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.header__title}>TgStickerTool</h1>
      </header>

      <main className={styles.content}>
        <div className={styles.actions}>
          <button className={styles.button} onClick={() => setIsModalOpen(true)}>
            Открыть модальное окно
          </button>
          <button className={`${styles.button} ${styles['button--secondary']}`}>
            Дополнительное действие
          </button>
        </div>
      </main>

      <Modal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="Пример модального окна"
        description="Это модальное окно создано с использованием Radix UI Dialog и стилизовано через SCSS модули."
      >
        <div className={styles.modalContent}>
          <p className={styles.modalContent__text}>
            Здесь может быть любой контент: формы, списки, изображения и т.д.
          </p>
          <div className={styles.modalContent__actions}>
            <button
              className={`${styles.button} ${styles['button--secondary']}`}
              onClick={() => setIsModalOpen(false)}
            >
              Отмена
            </button>
            <button className={styles.button} onClick={() => setIsModalOpen(false)}>
              Подтвердить
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
