import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TrashIcon, CheckIcon } from '@radix-ui/react-icons';
import styles from './PackViewPage.module.scss';

interface SortableItemProps {
  id: string;
  fragmentPath: string;
  isUploaded: boolean;
  onDelete: (path: string) => void;
}

export function SortableItem({ id, fragmentPath, isUploaded, onDelete }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={styles.fragment}>
      {fragmentPath.endsWith('.webm') ? (
        <video src={fragmentPath} autoPlay loop muted />
      ) : (
        <img src={fragmentPath} alt="Fragment" />
      )}
      {isUploaded && (
        <div className={styles.fragmentBadge}>
          <CheckIcon width={16} height={16} />
        </div>
      )}
      <button 
        className={styles.fragmentDelete}
        onClick={(e) => { e.stopPropagation(); onDelete(fragmentPath); }}
        title="Удалить"
      >
        <TrashIcon width={15} height={15} />
      </button>
    </div>
  );
}
