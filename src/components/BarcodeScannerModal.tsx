import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  Camera, 
  X, 
  Barcode, 
  SwitchCamera, 
  Flashlight, 
  Volume2, 
  VolumeX,
  Keyboard,
  Upload,
  AlertCircle
} from 'lucide-react';

export const playScanBeep = (type: 'success' | 'error' | 'warning' = 'success') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5
      osc.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.08); // E6
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.14);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    }
  } catch (e) {
    // AudioContext blocked without user interaction
  }
};

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedText: string) => boolean | void | Promise<boolean | void>;
  title?: string;
  subtitle?: string;
  continuous?: boolean;
  autoCloseOnSuccess?: boolean;
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Barcode / Serial Number',
  subtitle = 'Point camera at product serial number or barcode label',
  continuous = true,
  autoCloseOnSuccess = false
}: BarcodeScannerModalProps) {
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedTimeRef = useRef<{ [code: string]: number }>({});
  const readerElementId = 'barcode-scanner-viewport';

  // Initialize and list cameras
  useEffect(() => {
    if (!isOpen) {
      cleanupScanner();
      return;
    }

    setLastScanned(null);
    setScannedCount(0);
    setCameraError(null);
    setManualInput('');

    let isMounted = true;

    // Small delay to ensure the modal DOM element is rendered
    const initTimer = setTimeout(async () => {
      if (!isMounted) return;
      try {
        const devices = await Html5Qrcode.getCameras().catch(() => []);
        if (!isMounted) return;

        if (devices && devices.length > 0) {
          const camList = devices.map(d => ({ id: d.id, label: d.label || `Camera ${d.id}` }));
          setCameras(camList);
          // Prefer back/environment camera
          const backCam = camList.find(c => 
            c.label.toLowerCase().includes('back') || 
            c.label.toLowerCase().includes('rear') ||
            c.label.toLowerCase().includes('environment')
          );
          const chosenId = backCam ? backCam.id : camList[0].id;
          setCurrentCameraId(chosenId);
          await startScanning(chosenId);
        } else {
          // If no enumerated devices available yet, start with facingMode environment
          await startScanning({ facingMode: 'environment' });
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.warn('Camera setup warning, attempting fallback:', err);
        await startScanning({ facingMode: 'environment' });
      }
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(initTimer);
      cleanupScanner();
    };
  }, [isOpen]);

  const cleanupScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        console.warn('Error during scanner cleanup:', e);
      } finally {
        scannerRef.current = null;
        setIsScanning(false);
      }
    }
  };

  const startScanning = async (cameraConfig: string | MediaTrackConstraints) => {
    try {
      await cleanupScanner();
      setCameraError(null);

      // Verify DOM element exists
      let el = document.getElementById(readerElementId);
      if (!el) {
        await new Promise(res => setTimeout(res, 80));
        el = document.getElementById(readerElementId);
      }
      if (!el) {
        throw new Error('Scanner viewfinder container not found in DOM.');
      }

      // Clear any prior canvas or video children inside reader element
      el.innerHTML = '';

      // Create scanner instance with all standard 1D and 2D barcode formats
      const scanner = new Html5Qrcode(readerElementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX
        ],
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        },
        verbose: false
      });

      scannerRef.current = scanner;

      // Config without strict aspectRatio constraint so mobile/desktop cameras don't throw OverconstrainedError
      const config = {
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          // Generous scanning area so thermal barcodes and wide 1D barcodes fit comfortably
          const width = Math.floor(Math.min(viewfinderWidth * 0.94, 460));
          const height = Math.floor(Math.min(viewfinderHeight * 0.82, 280));
          return { width, height };
        }
      };

      try {
        await scanner.start(
          cameraConfig,
          config,
          (decodedText) => {
            handleDecodedCode(decodedText);
          },
          () => {
            // Frame parsed without barcode - normal scanning loop
          }
        );
      } catch (firstErr: any) {
        console.warn('Initial camera start failed, attempting fallback...', firstErr);
        if (typeof cameraConfig === 'string') {
          // If specific deviceId failed, fallback to facingMode 'environment'
          await scanner.start(
            { facingMode: 'environment' },
            config,
            (decodedText) => handleDecodedCode(decodedText),
            () => {}
          );
        } else if (typeof cameraConfig === 'object' && (cameraConfig as any)?.facingMode === 'environment') {
          // If environment facingMode failed, fallback to facingMode 'user'
          await scanner.start(
            { facingMode: 'user' },
            config,
            (decodedText) => handleDecodedCode(decodedText),
            () => {}
          );
        } else {
          throw firstErr;
        }
      }

      setIsScanning(true);

      // Check for torch capability
      try {
        const capabilities = scanner.getRunningTrackCapabilities();
        if (capabilities && (capabilities as any).torch) {
          setHasTorch(true);
        }
      } catch (e) {
        setHasTorch(false);
      }

      // Refresh camera devices list after permissions are granted
      try {
        const postDevices = await Html5Qrcode.getCameras().catch(() => []);
        if (postDevices && postDevices.length > 0) {
          setCameras(postDevices.map(d => ({ id: d.id, label: d.label || `Camera ${d.id}` })));
        }
      } catch (e) {
        // ignore
      }
    } catch (err: any) {
      console.error('Failed to start camera:', err);
      setIsScanning(false);
      setCameraError(
        err?.message || 'Could not access device camera. Please grant camera permission or use the barcode gun / manual input below.'
      );
    }
  };

  const handleDecodedCode = async (decodedText: string) => {
    const cleanText = decodedText.trim();
    if (!cleanText) return;

    // Debounce duplicate scans of the exact same code within 1.8 seconds
    const now = Date.now();
    const lastTime = lastScannedTimeRef.current[cleanText] || 0;
    if (now - lastTime < 1800) {
      return;
    }
    lastScannedTimeRef.current[cleanText] = now;

    // Trigger feedback
    if (soundEnabled) {
      playScanBeep('success');
    }
    setLastScanned(cleanText);
    setScannedCount(prev => prev + 1);

    const result = await Promise.resolve(onScan(cleanText));
    // If onScan returns false explicitly, treat as rejection
    if (result === false) {
      if (soundEnabled) playScanBeep('error');
      return;
    }

    if (autoCloseOnSuccess) {
      setTimeout(() => {
        onClose();
      }, 300);
    }
  };

  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === currentCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setCurrentCameraId(nextCamera.id);
    startScanning(nextCamera.id);
  };

  const handleToggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !torchOn;
      await (scannerRef.current as any).applyVideoConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    setManualInput('');
    handleDecodedCode(trimmed);
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let scanner = scannerRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(readerElementId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.CODABAR,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX
          ],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false
        });
      }
      const decodedText = await scanner.scanFile(file, true);
      if (decodedText) {
        handleDecodedCode(decodedText);
      }
    } catch (err: any) {
      console.warn('File scan failed:', err);
      alert('Could not decode a clear barcode from this image. Please ensure the barcode is sharp, high-contrast, and well lit.');
    } finally {
      e.target.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#0a382c] px-5 py-3.5 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white">{title}</h3>
              <p className="text-[11px] text-emerald-200/80 line-clamp-1">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
              title={soundEnabled ? 'Mute Beep' : 'Unmute Beep'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close Scanner"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewfinder Container */}
        <div className="relative bg-black flex-1 min-h-[260px] sm:min-h-[300px] flex items-center justify-center overflow-hidden">
          {/* HTML5 QR Code Mount Element */}
          <div 
            id={readerElementId} 
            className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full" 
          />

          {/* Target Reticle Overlay */}
          {isScanning && !cameraError && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
              <div className="relative w-4/5 max-w-[290px] h-36 sm:h-44 border-2 border-emerald-400/70 rounded-xl bg-emerald-500/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                {/* Corner Markers */}
                <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-sm" />
                <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-sm" />
                <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-sm" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-sm" />
                {/* Animated Laser Barcode Guide */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse absolute top-1/2 -translate-y-1/2" />
              </div>
              <p className="mt-4 text-[11px] font-semibold text-white/90 bg-black/60 px-3 py-1 rounded-full backdrop-blur-xs">
                Align barcode or serial inside the frame
              </p>
            </div>
          )}

          {/* Camera Controls Floating Bar */}
          {isScanning && !cameraError && (
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              {hasTorch && (
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  className={`p-2 rounded-xl backdrop-blur-md transition-all shadow-md ${
                    torchOn 
                      ? 'bg-amber-400 text-slate-900 font-bold' 
                      : 'bg-black/60 text-white hover:bg-black/80'
                  }`}
                  title="Toggle Flashlight"
                >
                  <Flashlight className="w-4 h-4" />
                </button>
              )}
              {cameras.length > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-all shadow-md"
                  title="Switch Camera"
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Error Message Display */}
          {cameraError && (
            <div className="p-6 text-center max-w-sm bg-white/95 rounded-2xl mx-4 shadow-xl border border-slate-200">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-2.5" />
              <h4 className="text-xs font-bold text-slate-900 mb-1">Camera Inactive or Denied</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed mb-4">
                {cameraError}
              </p>
              <button
                type="button"
                onClick={() => startScanning({ facingMode: 'environment' })}
                className="px-4 py-2 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                Retry Camera Access
              </button>
            </div>
          )}
        </div>

        {/* Live Scan Feedback & Status Strip */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-b border-slate-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
            <span className="text-[11px] font-bold text-slate-600 truncate">
              {lastScanned ? (
                <span className="text-emerald-800 font-mono">
                  Scanned: <span className="bg-emerald-100/80 px-1.5 py-0.5 rounded text-black font-bold">{lastScanned}</span>
                </span>
              ) : (
                'Scanner Active — ready for barcodes'
              )}
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg shrink-0">
            {scannedCount} scanned
          </span>
        </div>

        {/* Manual Input & Barcode Gun Section */}
        <div className="p-4 bg-white space-y-3 shrink-0">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Barcode className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Or type serial / scan with USB barcode gun..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                className="glass-input block w-full pl-9 pr-3 py-2 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-[#0a382c]/20"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!manualInput.trim()}
              className="px-4 py-2 bg-[#0a382c] hover:bg-[#0d4a3b] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Keyboard className="w-3.5 h-3.5" />
              Enter
            </button>
          </form>

          <div className="flex flex-wrap justify-between items-center gap-2 text-[10px] text-slate-500 pt-1">
            <div className="flex items-center gap-3">
              <span>Supports 1D Barcodes, 2D QR codes & Serial Numbers</span>
              <label className="inline-flex items-center gap-1 text-[#0a382c] hover:text-emerald-800 font-bold cursor-pointer hover:underline">
                <Upload className="w-3 h-3" />
                <span>Upload Barcode Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileScan}
                  className="hidden"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="font-bold text-slate-600 hover:text-slate-900 underline cursor-pointer"
            >
              Done Scanning
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
