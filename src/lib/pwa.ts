export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

/** Chrome PWA: reuse existing window when launching from home screen icon */
export function setupPwaLaunchHandler() {
  if (!('launchQueue' in window)) return;

  const launchQueue = (window as Window & {
    launchQueue: { setConsumer: (cb: (params: LaunchParams) => void) => void };
  }).launchQueue;

  launchQueue.setConsumer(() => {
    // focus-existing in manifest brings existing window to front; nothing else needed
  });
}

interface LaunchParams {
  targetURL?: string;
  files?: readonly FileSystemHandle[];
}
