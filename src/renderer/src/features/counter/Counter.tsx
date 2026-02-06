import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { increment, decrement, incrementByAmount } from './counterSlice';
import styles from './Counter.module.scss';

export function Counter() {
  const count = useAppSelector((state) => state.counter.value);
  const dispatch = useAppDispatch();

  return (
    <div className={styles.counter}>
      <div className={styles.counter__value}>{count}</div>
      <div className={styles.counter__buttons}>
        <button className={styles.counter__button} onClick={() => dispatch(decrement())}>
          -
        </button>
        <button className={styles.counter__button} onClick={() => dispatch(increment())}>
          +
        </button>
        <button className={styles.counter__button} onClick={() => dispatch(incrementByAmount(5))}>
          +5
        </button>
      </div>
    </div>
  );
}
