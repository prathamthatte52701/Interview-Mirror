import { useEffect, useState } from 'react';

let toasts = [];
let listeners = [];
let idCounter = 0;

function notify() {
  listeners.forEach((listener) => listener(toasts));
}

export function showToast(message, variant = 'success') {
  const id = ++idCounter;
  toasts = [...toasts, { id, message, variant }];
  notify();
  window.setTimeout(() => {
    toasts = toasts.filter((toast) => toast.id !== id);
    notify();
  }, 4000);
}

export function useToast() {
  const [list, setList] = useState(toasts);

  useEffect(() => {
    listeners.push(setList);
    return () => {
      listeners = listeners.filter((listener) => listener !== setList);
    };
  }, []);

  return { toasts: list, showToast };
}
