import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload,
  Download,
  Crop,
  ScanEye,
  RotateCcw,
  Check,
  FolderPlus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Move,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { createIconItemsFromFiles, cn, downloadDataUrl, getImageSize } from '@/utils';
import { autoCrop, detectContentBounds, cropImage } from '@/services/smartCropper';
import type { CropBounds } from '@/services/smartCropper';

type HandleType =
  | 'move'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w';

export default function Cropper() {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [originalDataUrl, setOriginalDataUrl] = useState<string>('');
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });
  const [originalName, setOriginalName] = useState<string>('icon');

  const [tolerance, setTolerance] = useState(10);
  const [detectSolidBg, setDetectSolidBg] = useState(false);

  const [cropBounds, setCropBounds] = useState<CropBounds>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const [previewResult, setPreviewResult] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);

  const [zoom, setZoom] = useState(1);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [saved, setSaved] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  const dragState = useRef<{
    active: boolean;
    handle: HandleType | null;
    startX: number;
    startY: number;
    startBounds: CropBounds;
  }>({
    active: false,
    handle: null,
    startX: 0,
    startY: 0,
    startBounds: { x: 0, y: 0, width: 0, height: 0 },
  });

  const { projects, addIcons, addIconsToProject } = useAppStore();

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setOriginalDataUrl(dataUrl);
      const size = await getImageSize(dataUrl);
      setOriginalSize(size);
      setOriginalName(file.name.replace(/\.[^/.]+$/, ''));
      setCropBounds({ x: 0, y: 0, width: size.width, height: size.height });
      setPreviewResult(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const runAutoDetect = useCallback(async () => {
    if (!originalDataUrl) return;
    setIsAutoDetecting(true);
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        const bounds = detectContentBounds(canvas, {
          tolerance,
          detectSolidBackground: detectSolidBg,
        });
        setCropBounds(bounds);
        setIsAutoDetecting(false);
      };
      img.src = originalDataUrl;
    } catch {
      setIsAutoDetecting(false);
    }
  }, [originalDataUrl, tolerance, detectSolidBg]);

  useEffect(() => {
    let cancelled = false;
    if (!originalDataUrl || cropBounds.width === 0) {
      setPreviewResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      const result = await cropImage(originalDataUrl, cropBounds);
      if (!cancelled) setPreviewResult(result);
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [originalDataUrl, cropBounds]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const displayScale = useMemo(() => {
    if (!containerRef.current || originalSize.width === 0) return 1;
    const containerRect = containerRef.current.getBoundingClientRect();
    const padding = 64;
    const availableW = containerRect.width - padding;
    const availableH = containerRect.height - padding;
    const scaleX = availableW / originalSize.width;
    const scaleY = availableH / originalSize.height;
    return Math.min(1, scaleX, scaleY) * zoom;
  }, [originalSize, zoom]);

  const handleMouseDown = (e: React.MouseEvent, handle: HandleType) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = {
      active: true,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startBounds: { ...cropBounds },
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.current.active || !dragState.current.handle) return;

      const dx = (e.clientX - dragState.current.startX) / displayScale;
      const dy = (e.clientY - dragState.current.startY) / displayScale;
      const handle = dragState.current.handle;
      const start = dragState.current.startBounds;

      let { x, y, width, height } = start;
      const minSize = 4;

      switch (handle) {
        case 'move':
          x = Math.max(0, Math.min(originalSize.width - start.width, start.x + dx));
          y = Math.max(0, Math.min(originalSize.height - start.height, start.y + dy));
          break;
        case 'nw':
          x = Math.max(0, start.x + dx);
          y = Math.max(0, start.y + dy);
          width = Math.max(minSize, start.width - (x - start.x));
          height = Math.max(minSize, start.height - (y - start.y));
          break;
        case 'n':
          y = Math.max(0, start.y + dy);
          height = Math.max(minSize, start.height - (y - start.y));
          break;
        case 'ne':
          y = Math.max(0, start.y + dy);
          width = Math.max(minSize, start.width + dx);
          height = Math.max(minSize, start.height - (y - start.y));
          if (x + width > originalSize.width) width = originalSize.width - x;
          break;
        case 'e':
          width = Math.max(minSize, start.width + dx);
          if (start.x + width > originalSize.width) width = originalSize.width - start.x;
          break;
        case 'se':
          width = Math.max(minSize, start.width + dx);
          height = Math.max(minSize, start.height + dy);
          if (start.x + width > originalSize.width) width = originalSize.width - start.x;
          if (start.y + height > originalSize.height) height = originalSize.height - start.y;
          break;
        case 's':
          height = Math.max(minSize, start.height + dy);
          if (start.y + height > originalSize.height) height = originalSize.height - start.y;
          break;
        case 'sw':
          x = Math.max(0, start.x + dx);
          width = Math.max(minSize, start.width - (x - start.x));
          height = Math.max(minSize, start.height + dy);
          if (start.y + height > originalSize.height) height = originalSize.height - start.y;
          break;
        case 'w':
          x = Math.max(0, start.x + dx);
          width = Math.max(minSize, start.width - (x - start.x));
          break;
      }

      setCropBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
    };

    const handleMouseUp = () => {
      dragState.current.active = false;
      dragState.current.handle = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [displayScale, originalSize]);

  const nudgeBounds = (direction: 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se', mode: 'move' | 'resize') => {
    const step = 1;
    const minSize = 4;
    setCropBounds((prev) => {
      let { x, y, width, height } = prev;

      if (mode === 'move') {
        switch (direction) {
          case 'n':
            y = Math.max(0, y - step);
            break;
          case 's':
            y = Math.min(originalSize.height - height, y + step);
            break;
          case 'w':
            x = Math.max(0, x - step);
            break;
          case 'e':
            x = Math.min(originalSize.width - width, x + step);
            break;
        }
      } else {
        switch (direction) {
          case 'nw':
            x = Math.max(0, x - step);
            y = Math.max(0, y - step);
            width = Math.max(minSize, width + step);
            height = Math.max(minSize, height + step);
            break;
          case 'n':
            y = Math.max(0, y - step);
            height = Math.max(minSize, height + step);
            break;
          case 'ne':
            y = Math.max(0, y - step);
            width = Math.max(minSize, width + step);
            height = Math.max(minSize, height + step);
            if (x + width > originalSize.width) width = originalSize.width - x;
            break;
          case 'e':
            width = Math.max(minSize, width + step);
            if (x + width > originalSize.width) width = originalSize.width - x;
            break;
          case 'se':
            width = Math.max(minSize, width + step);
            height = Math.max(minSize, height + step);
            if (x + width > originalSize.width) width = originalSize.width - x;
            if (y + height > originalSize.height) height = originalSize.height - y;
            break;
          case 's':
            height = Math.max(minSize, height + step);
            if (y + height > originalSize.height) height = originalSize.height - y;
            break;
          case 'sw':
            x = Math.max(0, x - step);
            width = Math.max(minSize, width + step);
            height = Math.max(minSize, height + step);
            if (y + height > originalSize.height) height = originalSize.height - y;
            break;
          case 'w':
            x = Math.max(0, x - step);
            width = Math.max(minSize, width + step);
            break;
        }
      }

      return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    });
  };

  const resetBounds = () => {
    setCropBounds({ x: 0, y: 0, width: originalSize.width, height: originalSize.height });
  };

  const saveToProject = async () => {
    if (!selectedProjectId || !previewResult) return;

    const byteString = atob(previewResult.dataUrl.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const file = new File([ab], `${originalName}-cropped.png`, { type: 'image/png' });
    const newIcons = await createIconItemsFromFiles([file]);

    try {
      await addIcons(newIcons);
      addIconsToProject(selectedProjectId, newIcons.map((i) => i.id));
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setShowProjectModal(false);
        setSelectedProjectId('');
      }, 1200);
    } catch {
      /* toast already shown in store */
    }
  };

  const handleDownload = () => {
    if (!previewResult) return;
    downloadDataUrl(previewResult.dataUrl, `${originalName}-cropped.png`);
  };

  const handleCrop = async () => {
    if (!originalDataUrl) return;
    setIsAutoDetecting(true);
    try {
      const result = await autoCrop(originalDataUrl, {
        tolerance,
        detectSolidBackground: detectSolidBg,
      });
      setCropBounds(result.bounds);
      setPreviewResult({ dataUrl: result.dataUrl, width: result.width, height: result.height });
    } finally {
      setIsAutoDetecting(false);
    }
  };

  const handleClear = () => {
    setOriginalDataUrl('');
    setOriginalSize({ width: 0, height: 0 });
    setOriginalName('icon');
    setCropBounds({ x: 0, y: 0, width: 0, height: 0 });
    setPreviewResult(null);
  };

  const displayBounds = {
    x: cropBounds.x * displayScale,
    y: cropBounds.y * displayScale,
    width: cropBounds.width * displayScale,
    height: cropBounds.height * displayScale,
  };

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 px-6 py-4 border-b border-ink-700/50 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">智能裁剪</h2>
          <p className="text-sm text-slate-500 mt-0.5">自动检测图标边界，去除多余透明像素或纯色背景</p>
        </div>
        <div className="flex items-center gap-2">
          {originalDataUrl && (
            <>
              <button onClick={handleClear} className="btn btn-secondary">
                <Trash2 className="w-4 h-4" />
                清除
              </button>
              <button onClick={handleDownload} className="btn btn-secondary" disabled={!previewResult}>
                <Download className="w-4 h-4" />
                下载
              </button>
              <button
                onClick={() => setShowProjectModal(true)}
                className="btn btn-primary"
                disabled={!previewResult}
              >
                <FolderPlus className="w-4 h-4" />
                保存到项目
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr_280px] gap-0">
        <div className="flex flex-col border-r border-ink-700/50 overflow-hidden">
          <div className="p-4 border-b border-ink-700/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-neon-cyan" />
                上传图标
              </h3>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
                isDragging
                  ? 'border-neon-cyan bg-neon-cyan/5'
                  : 'border-ink-600 hover:border-neon-cyan/40 hover:bg-white/[0.02]'
              )}
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-slate-500" />
              <div className="text-sm text-slate-400">
                {isDragging ? '松开以上传' : '拖拽或点击上传图标'}
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />

            {originalDataUrl && (
              <div className="mt-3 p-3 bg-ink-900/50 rounded-lg border border-ink-700/50">
                <div className="checkerboard rounded p-2 mb-2">
                  <img src={originalDataUrl} alt="original" className="max-w-full max-h-32 mx-auto" />
                </div>
                <div className="text-xs text-slate-400 font-mono text-center">
                  {originalSize.width} × {originalSize.height} px
                </div>
                <div className="text-[10px] text-slate-500 font-mono text-center mt-1 truncate">
                  {originalName}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-b border-ink-700/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <Crop className="w-4 h-4 text-neon-amber" />
                裁剪参数
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-slate-400">容差 (0-100)</label>
                  <span className="text-xs font-mono text-neon-cyan">{tolerance}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={tolerance}
                  onChange={(e) => setTolerance(parseInt(e.target.value))}
                  className="w-full accent-neon-cyan"
                />
                <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                  <span>保守</span>
                  <span>激进</span>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={detectSolidBg}
                  onChange={(e) => setDetectSolidBg(e.target.checked)}
                  className="w-4 h-4 accent-neon-cyan"
                />
                <span className="text-xs text-slate-300">检测纯色背景</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCrop}
                  disabled={!originalDataUrl || isAutoDetecting}
                  className="btn btn-primary !py-2 text-xs disabled:opacity-40"
                >
                  <ScanEye className={cn('w-3.5 h-3.5', isAutoDetecting && 'animate-spin')} />
                  自动裁剪
                </button>
                <button
                  onClick={resetBounds}
                  disabled={!originalDataUrl}
                  className="btn btn-secondary !py-2 text-xs disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  重置
                </button>
              </div>

              <button
                onClick={runAutoDetect}
                disabled={!originalDataUrl || isAutoDetecting}
                className="w-full btn btn-ghost text-xs disabled:opacity-40"
              >
                <ScanEye className={cn('w-3.5 h-3.5', isAutoDetecting && 'animate-spin')} />
                {isAutoDetecting ? '检测中...' : '仅检测边界'}
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-ink-700/50">
            <h3 className="font-semibold text-sm text-white mb-3">当前裁剪区域</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-ink-900/50 rounded px-3 py-2">
                <span className="text-slate-500">X: </span>
                <span className="font-mono text-slate-300">{cropBounds.x}</span>
              </div>
              <div className="bg-ink-900/50 rounded px-3 py-2">
                <span className="text-slate-500">Y: </span>
                <span className="font-mono text-slate-300">{cropBounds.y}</span>
              </div>
              <div className="bg-ink-900/50 rounded px-3 py-2">
                <span className="text-slate-500">W: </span>
                <span className="font-mono text-slate-300">{cropBounds.width}</span>
              </div>
              <div className="bg-ink-900/50 rounded px-3 py-2">
                <span className="text-slate-500">H: </span>
                <span className="font-mono text-slate-300">{cropBounds.height}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crop className="w-4 h-4 text-neon-cyan" />
              <h3 className="font-semibold text-sm text-white">裁剪预览</h3>
              {originalDataUrl && (
                <span className="chip bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 font-mono">
                  {originalSize.width}×{originalSize.height}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))} className="btn-ghost btn !px-2 !py-1">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 w-14 text-center font-mono">
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))} className="btn-ghost btn !px-2 !py-1">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => setZoom(1)} className="btn-ghost btn !px-2 !py-1 ml-1">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            ref={containerRef}
            className="flex-1 overflow-auto scrollbar-thin bg-ink-950/50 p-8 flex items-start justify-center"
          >
            {!originalDataUrl ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600">
                <Crop className="w-16 h-16 mb-4 opacity-30" />
                <div className="text-sm">上传图标开始智能裁剪</div>
              </div>
            ) : (
              <div
                className="relative checkerboard rounded-lg inline-block"
                style={{
                  width: originalSize.width * displayScale,
                  height: originalSize.height * displayScale,
                }}
              >
                <img
                  src={originalDataUrl}
                  alt="original"
                  className="absolute inset-0 w-full h-full block select-none pointer-events-none"
                  style={{ imageRendering: zoom > 1.5 ? 'pixelated' : 'auto' }}
                  draggable={false}
                />

                <div
                  className="absolute"
                  style={{
                    left: 0,
                    top: 0,
                    width: originalSize.width * displayScale,
                    height: originalSize.height * displayScale,
                  }}
                >
                  <div
                    className="absolute inset-0 bg-ink-950/60"
                    style={{
                      clipPath: `polygon(
                        0 0, 100% 0, 100% 100%, 0 100%,
                        0 0,
                        ${displayBounds.x}px ${displayBounds.y}px,
                        ${displayBounds.x + displayBounds.width}px ${displayBounds.y}px,
                        ${displayBounds.x + displayBounds.width}px ${displayBounds.y + displayBounds.height}px,
                        ${displayBounds.x}px ${displayBounds.y + displayBounds.height}px,
                        ${displayBounds.x}px ${displayBounds.y}px
                      )`,
                    }}
                  />
                </div>

                <div
                  className="absolute border-2 border-neon-cyan cursor-move"
                  style={{
                    left: displayBounds.x,
                    top: displayBounds.y,
                    width: displayBounds.width,
                    height: displayBounds.height,
                    boxShadow: '0 0 0 1px rgba(34, 211, 238, 0.3)',
                  }}
                  onMouseDown={(e) => handleMouseDown(e, 'move')}
                >
                  <div className="absolute -top-5 left-0 text-[10px] font-mono text-neon-cyan bg-ink-950/80 px-1.5 py-0.5 rounded whitespace-nowrap">
                    {cropBounds.width}×{cropBounds.height}
                  </div>

                  {[
                    { pos: '-top-1.5 -left-1.5 cursor-nw-resize', handle: 'nw' as HandleType },
                    { pos: '-top-1.5 left-1/2 -translate-x-1/2 cursor-n-resize', handle: 'n' as HandleType },
                    { pos: '-top-1.5 -right-1.5 cursor-ne-resize', handle: 'ne' as HandleType },
                    { pos: 'top-1/2 -right-1.5 -translate-y-1/2 cursor-e-resize', handle: 'e' as HandleType },
                    { pos: '-bottom-1.5 -right-1.5 cursor-se-resize', handle: 'se' as HandleType },
                    { pos: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-s-resize', handle: 's' as HandleType },
                    { pos: '-bottom-1.5 -left-1.5 cursor-sw-resize', handle: 'sw' as HandleType },
                    { pos: 'top-1/2 -left-1.5 -translate-y-1/2 cursor-w-resize', handle: 'w' as HandleType },
                  ].map(({ pos, handle }) => (
                    <div
                      key={handle}
                      className={cn(
                        'absolute w-3 h-3 bg-neon-cyan border-2 border-ink-950 rounded-sm',
                        pos
                      )}
                      onMouseDown={(e) => handleMouseDown(e, handle)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col border-l border-ink-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-700/50">
            <h3 className="font-semibold text-sm text-white">裁剪结果</h3>
          </div>

          <div className="flex-1 overflow-auto scrollbar-thin p-4">
            {previewResult ? (
              <div className="space-y-4">
                <div className="checkerboard rounded-lg p-4 flex items-center justify-center">
                  <img
                    src={previewResult.dataUrl}
                    alt="cropped"
                    className="max-w-full max-h-48"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-ink-900/50 rounded px-3 py-2 text-center">
                    <div className="text-slate-500">宽度</div>
                    <div className="font-mono text-slate-200">{previewResult.width}px</div>
                  </div>
                  <div className="bg-ink-900/50 rounded px-3 py-2 text-center">
                    <div className="text-slate-500">高度</div>
                    <div className="font-mono text-slate-200">{previewResult.height}px</div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 leading-relaxed">
                  已去除 {(originalSize.width * originalSize.height - previewResult.width * previewResult.height) > 0
                    ? Math.round(
                        ((originalSize.width * originalSize.height - previewResult.width * previewResult.height) /
                          (originalSize.width * originalSize.height)) *
                          100
                      )
                    : 0}
                  % 像素
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-sm">
                裁剪结果将在这里显示
              </div>
            )}
          </div>

          {originalDataUrl && (
            <div className="p-4 border-t border-ink-700/50">
              <h3 className="font-semibold text-xs text-slate-400 mb-3 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5" />
                精细微调
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-slate-500 mb-1.5">移动选区</div>
                  <div className="grid grid-cols-3 gap-1">
                    <div />
                    <button
                      onClick={() => nudgeBounds('n', 'move')}
                      className="h-7 bg-ink-800 border border-ink-600 rounded text-slate-400 hover:text-neon-cyan hover:border-ink-500 text-xs"
                    >
                      <ChevronUp className="w-4 h-4 mx-auto" />
                    </button>
                    <div />
                    <button
                      onClick={() => nudgeBounds('w', 'move')}
                      className="h-7 bg-ink-800 border border-ink-600 rounded text-slate-400 hover:text-neon-cyan hover:border-ink-500 text-xs"
                    >
                      <ChevronLeft className="w-4 h-4 mx-auto" />
                    </button>
                    <button
                      onClick={resetBounds}
                      className="h-7 bg-ink-800 border border-ink-600 rounded text-slate-400 hover:text-neon-cyan hover:border-ink-500 text-[10px]"
                    >
                      重置
                    </button>
                    <button
                      onClick={() => nudgeBounds('e', 'move')}
                      className="h-7 bg-ink-800 border border-ink-600 rounded text-slate-400 hover:text-neon-cyan hover:border-ink-500 text-xs"
                    >
                      <ChevronRight className="w-4 h-4 mx-auto" />
                    </button>
                    <div />
                    <button
                      onClick={() => nudgeBounds('s', 'move')}
                      className="h-7 bg-ink-800 border border-ink-600 rounded text-slate-400 hover:text-neon-cyan hover:border-ink-500 text-xs"
                    >
                      <ChevronDown className="w-4 h-4 mx-auto" />
                    </button>
                    <div />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm">
          <div className="card p-6 w-96">
            <h3 className="text-lg font-bold text-white mb-4">保存到项目</h3>
            {saved ? (
              <div className="py-8 text-center">
                <Check className="w-12 h-12 text-neon-lime mx-auto mb-3" />
                <div className="text-slate-300">已保存裁剪后的图标</div>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin mb-4">
                  {projects.length === 0 ? (
                    <div className="text-sm text-slate-500 py-4 text-center">
                      暂无项目，请先在图标库中创建
                    </div>
                  ) : (
                    projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProjectId(p.id)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-lg border transition-all',
                          selectedProjectId === p.id
                            ? 'border-neon-cyan/60 bg-neon-cyan/10'
                            : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                        )}
                      >
                        <div className="font-medium text-sm text-white">{p.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{p.iconIds.length} 个图标</div>
                      </button>
                    ))
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowProjectModal(false)} className="btn btn-secondary">
                    取消
                  </button>
                  <button
                    onClick={saveToProject}
                    disabled={!selectedProjectId}
                    className="btn btn-primary disabled:opacity-40"
                  >
                    保存
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
