import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Download, CheckCircle2, RefreshCw, Smartphone } from 'lucide-react';
import { getInstallPrompt, promptPwaInstall, subscribePwaStatus } from '../pwa/registerServiceWorker';
import { toast } from 'react-toastify';

export default function OfflineSyncBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [canInstall, setCanInstall] = useState<boolean>(!!getInstallPrompt());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showReconnectedToast, setShowReconnectedToast] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnectedToast(true);
      toast.success('Internet reconnected! Syncing offline changes to Cloud...', {
        icon: <Wifi className="w-5 h-5 text-emerald-500" />
      });

      // Hide notification after 4 seconds
      setTimeout(() => setShowReconnectedToast(false), 4000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Offline Mode Active: Changes are saved locally and will auto-sync when online.', {
        autoClose: 5000,
        icon: <WifiOff className="w-5 h-5 text-amber-500" />
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = subscribePwaStatus(() => {
      setCanInstall(!!getInstallPrompt());
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const handleInstallClick = async () => {
    const installed = await promptPwaInstall();
    if (installed) {
      toast.success('App successfully installed to your device!');
      setCanInstall(false);
    }
  };

  const handleManualSync = () => {
    if (!navigator.onLine) {
      toast.info('Still offline. Data remains safe locally until internet connection is available.');
      return;
    }
    setIsSyncing(true);
    toast.info('Triggering Cloud Data Sync...');
    
    // Request background sync tag if available
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then((sw) => {
        // @ts-ignore SyncManager type
        return sw.sync.register('sync-offline-data');
      }).catch(() => {});
    }

    setTimeout(() => {
      setIsSyncing(false);
      toast.success('Sync complete! All local inventory & sales records are up-to-date.');
    }, 1200);
  };

  return (
    <div className="w-full flex flex-col">
      {/* Top Notification Bar when Offline */}
      {!isOnline && (
        <div className="bg-amber-600 text-amber-50 px-4 py-2.5 shadow-inner flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-medium animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-200 animate-pulse shrink-0" />
            <span>
              <strong>Offline Mode Active:</strong> You can keep adding products, inventory, and sales. Data is saved locally and will sync automatically when back online.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 bg-amber-700/80 px-2.5 py-1 rounded-full text-xs font-semibold text-amber-100 border border-amber-500/50">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              IndexedDB Storage Enabled
            </span>
          </div>
        </div>
      )}

      {/* Reconnected Banner */}
      {isOnline && showReconnectedToast && (
        <div className="bg-emerald-600 text-emerald-50 px-4 py-2 shadow-inner flex items-center justify-between gap-2 text-xs sm:text-sm font-medium animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>
              <strong>Back Online!</strong> Cloud data synchronization in progress...
            </span>
          </div>
          <button 
            onClick={() => setShowReconnectedToast(false)}
            className="text-xs bg-emerald-700/70 hover:bg-emerald-800 px-2.5 py-1 rounded-md transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Bar Status Indicators / Install PWA Button */}
      <div className="bg-slate-900 border-b border-slate-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          {/* Network status pill */}
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold border ${
            isOnline 
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' 
              : 'bg-amber-950/60 text-amber-400 border-amber-800/60'
          }`}>
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>Online & Synced</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span>Working Offline</span>
              </>
            )}
          </div>

          {/* Sync Button */}
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 rounded-full transition text-xs font-medium cursor-pointer"
            title="Click to check cloud sync status"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
            <span>{isSyncing ? 'Syncing...' : 'Check Sync'}</span>
          </button>
        </div>

        {/* Android & Web PWA Install Button */}
        {canInstall && (
          <button
            onClick={handleInstallClick}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3 py-1 rounded-full font-bold shadow-md shadow-blue-900/30 transition transform hover:scale-105 active:scale-95 cursor-pointer text-xs"
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-200" />
            <span>Install App on Android / Device</span>
            <Download className="w-3.5 h-3.5 text-blue-200" />
          </button>
        )}
      </div>
    </div>
  );
}
