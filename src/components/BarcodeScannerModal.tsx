import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  AlertCircle,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';

// Audio feedback for scanner
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
  } catch {
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
  subtitle = 'Point device camera directly at barcode or serial label',
  continuous = true,
  autoCloseOnSuccess = false
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const isDecodingBusyRef = useRef(false);
  const lastScannedTimeRef = useRef<{ [code: string]: number }>({});

  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Initialize ZXing MultiFormatReader with TRY_HARDER and all barcode formats
  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    zxingReaderRef.current = new BrowserMultiFormatReader(hints, 200);

    return () => {
      if (zxingReaderRef.current) {
        try {
          zxingReaderRef.current.reset();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Handle successful barcode decoded
  const handleBarcodeDecoded = useCallback(async (code: string) => {
    const clean = code.trim();
    if (!clean) return;

    // Debounce exact duplicate scans within 1.8s
    const now = Date.now();
    const lastTime = lastScannedTimeRef.current[clean] || 0;
    if (now - lastTime < 1800) {
      return;
    }
    lastScannedTimeRef.current[clean] = now;

    if (soundEnabled) {
      playScanBeep('success');
    }
    setLastScannedCode(clean);
    setScanCount(prev => prev + 1);

    const result = await Promise.resolve(onScan(clean));
    if (result === false) {
      if (soundEnabled) playScanBeep('error');
      return;
    }

    if (autoCloseOnSuccess) {
      setTimeout(() => {
        onClose();
      }, 300);
    }
  }, [onScan, soundEnabled, autoCloseOnSuccess, onClose]);

  // Stop camera stream safely
  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
    setHasTorch(false);
  }, []);

  // Start Camera Stream
  const startCamera = useCallback(async (deviceIdToUse?: string) => {
    stopCamera();
    setCameraError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API is not supported by this browser. Please use Chrome, Safari, or Edge.');
      return;
    }

    try {
      let stream: MediaStream | null = null;
      
      // Strategy 1: Specific deviceId if provided
      if (deviceIdToUse) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: deviceIdToUse },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
        } catch {
          stream = null;
        }
      }

      // Strategy 2: Environment / Rear camera with standard resolution
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
        } catch {
          stream = null;
        }
      }

      // Strategy 3: Standard fallback without facingMode constraints (works on laptops & webcams)
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        } catch (err: any) {
          throw err;
        }
      }

      if (!stream) {
        throw new Error('Unable to obtain camera stream from device.');
      }

      streamRef.current = stream;

      // Check for torch capability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities = (videoTrack.getCapabilities && videoTrack.getCapabilities()) as any;
          if (capabilities && capabilities.torch) {
            setHasTorch(true);
          }
        } catch {
          setHasTorch(false);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);

        // Update list of camera devices
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
          setAvailableDevices(videoDevices);
          if (!deviceIdToUse && videoTrack) {
            const currentSettings = videoTrack.getSettings();
            if (currentSettings.deviceId) {
              setSelectedDeviceId(currentSettings.deviceId);
            }
          }
        } catch {
          // ignore
        }

        // Start frame decoding loop
        startDecodingLoop();
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      let message = 'Could not access device camera. Please allow camera permissions in your browser.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera permission was denied. Please click the camera icon in your browser address bar and select "Always Allow".';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No camera device was detected on your computer or phone.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = 'Camera is already in use by another application or tab. Please close other camera apps and retry.';
      }
      setCameraError(message);
      setIsCameraActive(false);
    }
  }, [stopCamera]);

  // Frame decoding loop using BarcodeDetector + ZXing
  const startDecodingLoop = useCallback(() => {
    let hasBarcodeDetector = 'BarcodeDetector' in window;
    let barcodeDetector: any = null;

    if (hasBarcodeDetector) {
      try {
        const supportedFormats = [
          'code_128',
          'code_39',
          'code_93',
          'codabar',
          'ean_13',
          'ean_8',
          'itf',
          'upc_a',
          'upc_e',
          'qr_code',
          'data_matrix'
        ];
        barcodeDetector = new (window as any).BarcodeDetector({ formats: supportedFormats });
      } catch {
        hasBarcodeDetector = false;
        barcodeDetector = null;
      }
    }

    let lastScanTick = 0;

    const tick = async (timestamp: number) => {
      if (!streamRef.current || !videoRef.current) {
        return;
      }

      const video = videoRef.current;

      // Run scan every ~90ms to preserve battery and CPU while maintaining snappy detection
      if (timestamp - lastScanTick > 90 && video.readyState >= 2 && !isDecodingBusyRef.current) {
        lastScanTick = timestamp;
        isDecodingBusyRef.current = true;

        try {
          let codeFound: string | null = null;

          // 1. Try native BarcodeDetector API (fastest, hardware accelerated)
          if (barcodeDetector) {
            try {
              const detected = await barcodeDetector.detect(video);
              if (detected && detected.length > 0 && detected[0].rawValue) {
                codeFound = detected[0].rawValue;
              }
            } catch {
              // BarcodeDetector failed on this frame, will fallback to ZXing
            }
          }

          // 2. Fallback to ZXing MultiFormatReader if native detector didn't find anything
          if (!codeFound && zxingReaderRef.current) {
            try {
              // Draw video frame to hidden canvas
              if (!canvasRef.current) {
                canvasRef.current = document.createElement('canvas');
              }
              const canvas = canvasRef.current;
              const vw = video.videoWidth || 640;
              const vh = video.videoHeight || 480;
              if (canvas.width !== vw || canvas.height !== vh) {
                canvas.width = vw;
                canvas.height = vh;
              }

              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, vw, vh);
                // Scan canvas with ZXing
                const result = zxingReaderRef.current.decodeFromCanvas(canvas);
                if (result && result.getText()) {
                  codeFound = result.getText();
                }
              }
            } catch {
              // No code on this frame
            }
          }

          if (codeFound) {
            handleBarcodeDecoded(codeFound);
          }
        } finally {
          isDecodingBusyRef.current = false;
        }
      }

      scanLoopRef.current = requestAnimationFrame(tick);
    };

    scanLoopRef.current = requestAnimationFrame(tick);
  }, [handleBarcodeDecoded]);

  // Lifecycle when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setLastScannedCode(null);
      setScanCount(0);
      setManualInput('');
      setCameraError(null);
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    try {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        const nextState = !isTorchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }]
        });
        setIsTorchOn(nextState);
      }
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  // Switch between cameras (front/back/external)
  const handleSwitchCamera = () => {
    if (availableDevices.length <= 1) return;
    const currentIndex = availableDevices.findIndex(d => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % availableDevices.length;
    const nextDevice = availableDevices[nextIndex];
    setSelectedDeviceId(nextDevice.deviceId);
    startCamera(nextDevice.deviceId);
  };

  // Manual input form submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualInput.trim();
    if (!clean) return;
    setManualInput('');
    handleBarcodeDecoded(clean);
  };

  // Upload barcode image fallback
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = objectUrl;
      });

      let decodedText: string | null = null;

      // 1. Try BarcodeDetector on image
      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e', 'qr_code']
          });
          const detected = await detector.detect(img);
          if (detected && detected.length > 0 && detected[0].rawValue) {
            decodedText = detected[0].rawValue;
          }
        } catch {
          // fallback to ZXing
        }
      }

      // 2. Try ZXing
      if (!decodedText && zxingReaderRef.current) {
        try {
          const result = await zxingReaderRef.current.decodeFromImageElement(img);
          if (result && result.getText()) {
            decodedText = result.getText();
          }
        } catch {
          // fallback
        }
      }

      URL.revokeObjectURL(objectUrl);

      if (decodedText) {
        handleBarcodeDecoded(decodedText);
      } else {
        alert('Could not decode a clear barcode from this image. Please ensure the barcode is sharp, high-contrast, and well lit.');
      }
    } catch (err) {
      console.error('File scan failed:', err);
      alert('Failed to read image file.');
    } finally {
      setIsProcessingFile(false);
      e.target.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[94vh]">
        {/* Modal Header */}
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
              className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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

        {/* Viewfinder Video Area */}
        <div className="relative bg-slate-950 flex-1 min-h-[280px] sm:min-h-[320px] flex items-center justify-center overflow-hidden">
          {/* Live Device Camera Video Element */}
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isCameraActive ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Target Reticle Overlay with Laser Animation */}
          {isCameraActive && !cameraError && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
              <div className="relative w-4/5 max-w-[320px] h-36 sm:h-44 border-2 border-emerald-400/80 rounded-xl bg-emerald-500/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.50)]">
                {/* Reticle Corner Highlights */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-sm" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-sm" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-sm" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-sm" />
                {/* Laser Sweep Guide */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_#ef4444] animate-pulse absolute top-1/2 -translate-y-1/2" />
              </div>
              <p className="mt-4 text-[11px] font-semibold text-white/90 bg-black/60 px-3.5 py-1 rounded-full backdrop-blur-xs shadow-md">
                Align barcode or serial within frame
              </p>
            </div>
          )}

          {/* Floating Camera Controls (Switch, Torch) */}
          {isCameraActive && !cameraError && (
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-2 rounded-xl backdrop-blur-md transition-all shadow-md cursor-pointer ${
                    isTorchOn 
                      ? 'bg-amber-400 text-slate-900 font-bold shadow-amber-400/30' 
                      : 'bg-black/60 text-white hover:bg-black/80'
                  }`}
                  title={isTorchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                >
                  <Flashlight className="w-4 h-4" />
                </button>
              )}
              {availableDevices.length > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-all shadow-md cursor-pointer"
                  title="Switch Camera (Front/Back)"
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Camera Loading Spinner */}
          {!isCameraActive && !cameraError && (
            <div className="text-center p-6 space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-xs font-bold text-slate-200">Connecting to device camera...</p>
            </div>
          )}

          {/* Camera Error Display */}
          {cameraError && (
            <div className="p-6 text-center max-w-sm bg-white/95 rounded-2xl mx-4 shadow-xl border border-slate-200">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-2.5" />
              <h4 className="text-xs font-bold text-slate-900 mb-1">Camera Permission or Device Issue</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed mb-4">
                {cameraError}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => startCamera(selectedDeviceId)}
                  className="px-4 py-2 bg-[#0a382c] hover:bg-[#0d4a3b] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Try Again
                </button>
                <p className="text-[10px] text-slate-400">
                  Tip: If prompted, tap "Allow" to grant camera access, or use the manual bar below.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Live Feedback Strip */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-b border-slate-200 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isCameraActive ? 'bg-emerald-500 animate-ping' : 'bg-amber-400'}`} />
            <span className="text-[11px] font-bold text-slate-700 truncate">
              {lastScannedCode ? (
                <span className="text-emerald-800 font-mono inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Scanned: <span className="bg-emerald-100 text-black px-1.5 py-0.5 rounded font-bold">{lastScannedCode}</span>
                </span>
              ) : (
                isCameraActive ? 'Camera Active — Hold barcode steady in frame' : 'Initializing camera scanner...'
              )}
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg shrink-0">
            {scanCount} scanned
          </span>
        </div>

        {/* Manual Input & Barcode Gun / Photo Section */}
        <div className="p-4 bg-white space-y-3 shrink-0">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Barcode className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Or enter serial / scan with USB barcode scanner..."
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
                <span>{isProcessingFile ? 'Scanning Image...' : 'Upload Barcode Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={isProcessingFile}
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
