import { ReactNode } from 'react';
import styles from './IconButton.module.scss';

interface IconButtonProps {
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  title?: string;
  className?: string;
}

export function IconButton({ icon, onClick, disabled, variant = 'ghost', title, className }: IconButtonProps) {
  return (
    <button
      className={`${styles.iconButton} ${styles[variant]} ${className || ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon}
    </button>
  );
}
