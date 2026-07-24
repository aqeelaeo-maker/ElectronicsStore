// PWA Service Worker registration and Install Prompt manager

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function notifyPwaListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribePwaStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      console.log('User accepted PWA installation');
      deferredPrompt = null;
      notifyPwaListeners();
      return true;
    }
  } catch (err) {
    console.error('Error prompting PWA install:', err);
  }
  return false;
}

export function registerServiceWorker() {
  if (typeof window === 'undefined') return;

  // Listen for beforeinstallprompt on Android & Desktop Chrome
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    console.log('[PWA] beforeinstallprompt event captured');
    notifyPwaListeners();
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Application was installed as PWA');
    deferredPrompt = null;
    notifyPwaListeners();
  });

  // Register Service Worker if supported
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[PWA] ServiceWorker registered with scope:', reg.scope);

          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('[PWA] New content available; please refresh.');
                  } else {
                    console.log('[PWA] Content is cached for offline use.');
                  }
                }
              };
            }
          };
        })
        .catch((err) => {
          console.error('[PWA] ServiceWorker registration failed:', err);
        });
    });

    // Handle messages from SW (e.g. background sync events)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'BACKGROUND_SYNC_TRIGGERED') {
        console.log('[PWA] ServiceWorker notified background sync completed');
        notifyPwaListeners();
      }
    });
  }
}
