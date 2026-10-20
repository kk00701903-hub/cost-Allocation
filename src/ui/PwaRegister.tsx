'use client';
import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function PwaRegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (standalone) setInstalled(true);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);

    if ('serviceWorker' in navigator) {
      const swUrl = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/sw.js`;
      navigator.serviceWorker.register(swUrl).catch(() => {
        /* ignore offline/register errors in dev */
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  return (
    <button
      type="button"
      className="pwa-install"
      onClick={async () => {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === 'accepted') setDeferred(null);
      }}
    >
      앱 설치
    </button>
  );
}
