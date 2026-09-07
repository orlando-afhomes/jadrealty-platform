import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { IconButton } from './IconButton';
import styles from './Toast.module.css';

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export interface ToastInput {
  title: string;
  message?: ReactNode;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: string;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

/**
 * Global toast/notification surface (DESIGN-SYSTEM §6 "Notification"). Live
 * region announcements: `role="alert"` for danger, `role="status"` otherwise.
 * Auto-dismisses; timers cleared on unmount.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
    const timer = timers.current[id];
    if (timer) clearTimeout(timer);
    delete timers.current[id];
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
    for (const id of Object.keys(timers.current)) {
      const timer = timers.current[id];
      if (timer) clearTimeout(timer);
    }
    timers.current = {};
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = `toast-${nextId++}`;
      setToasts((prev) => [...prev, { ...input, id }]);
      const durationMs = input.durationMs ?? 5000;
      timers.current[id] = setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const id of Object.keys(timers.current)) {
        const timer = timers.current[id];
        if (timer) clearTimeout(timer);
      }
    },
    [],
  );

  const value = useMemo(() => ({ toast, dismiss, dismissAll }), [toast, dismiss, dismissAll]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.region} aria-live="polite" aria-atomic="false">
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'danger' ? 'alert' : 'status'}
            className={`${styles.toast} ${styles[item.tone ?? 'info']}`}
          >
            <div className={styles.body}>
              <p className={styles.title}>{item.title}</p>
              {item.message ? <div className={styles.message}>{item.message}</div> : null}
            </div>
            <IconButton
              icon="close"
              label="Dismiss notification"
              onClick={() => dismiss(item.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
