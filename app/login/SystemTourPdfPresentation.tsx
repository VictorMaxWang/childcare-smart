"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import styles from "./login-pixel.module.css";

const PDF_URL = "/demo/huiyu-tongxing.pdf";
const TOUR_IMAGE_BASE_URL = "/demo/system-tour/v1";
const TOUR_PAGE_COUNT = 22;
const INITIAL_PRELOAD_PAGES = [1, 2, 3];

type SystemTourPdfPresentationProps = {
  open: boolean;
  onClose: () => void;
};

const loadedTourImages = new Set<number>();
const pendingTourImages = new Map<number, Promise<void>>();

function clampPage(page: number, pageCount: number) {
  if (pageCount <= 0) return 1;
  return Math.min(Math.max(page, 1), pageCount);
}

function getTourImageUrl(page: number) {
  return `${TOUR_IMAGE_BASE_URL}/page-${String(page).padStart(2, "0")}.webp`;
}

function preloadTourImage(page: number) {
  if (typeof window === "undefined" || page < 1 || page > TOUR_PAGE_COUNT) {
    return Promise.resolve();
  }

  if (loadedTourImages.has(page)) {
    return Promise.resolve();
  }

  const pending = pendingTourImages.get(page);
  if (pending) return pending;

  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      loadedTourImages.add(page);
      pendingTourImages.delete(page);
      resolve();
    };
    image.onerror = () => {
      pendingTourImages.delete(page);
      reject(new Error(`System tour image failed to load: page ${page}`));
    };
    image.src = getTourImageUrl(page);
  });

  pendingTourImages.set(page, promise);
  return promise;
}

function scheduleInitialPreload() {
  const run = () => {
    for (const page of INITIAL_PRELOAD_PAGES) {
      void preloadTourImage(page).catch(() => undefined);
    }
  };

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(run, { timeout: 1200 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = globalThis.setTimeout(run, 300);
  return () => globalThis.clearTimeout(timeoutId);
}

export default function SystemTourPdfPresentation({ open, onClose }: SystemTourPdfPresentationProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

  const currentImageSrc = useMemo(() => getTourImageUrl(currentPage), [currentPage]);

  const goNext = useCallback(() => {
    setCurrentPage((prev) => clampPage(prev + 1, TOUR_PAGE_COUNT));
  }, []);

  const goPrevious = useCallback(() => {
    setCurrentPage((prev) => clampPage(prev - 1, TOUR_PAGE_COUNT));
  }, []);

  useEffect(() => {
    return scheduleInitialPreload();
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        goNext();
        return;
      }

      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        goPrevious();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious, onClose, open]);

  useEffect(() => {
    if (!open) return;

    setCurrentPage(1);
    setLoadError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadError("");
    setImageLoading(!loadedTourImages.has(currentPage));

    void preloadTourImage(currentPage)
      .then(() => {
        if (!cancelled) setImageLoading(false);
      })
      .catch((error) => {
        if (!cancelled) {
          setImageLoading(false);
          setLoadError(error instanceof Error ? error.message : "系统导览图片加载失败");
        }
      });

    for (const page of [currentPage - 1, currentPage + 1, currentPage + 2]) {
      void preloadTourImage(page).catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [currentPage, open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className={styles.presentationOverlay}
      data-testid="system-tour-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="系统导览"
      tabIndex={-1}
    >
      <div className={styles.presentationTopBar}>
        <div className={styles.presentationMeta}>
          <span className={styles.presentationTitle}>系统导览</span>
          <span className={styles.presentationPageCount} data-testid="system-tour-page-count">
            {currentPage} / {TOUR_PAGE_COUNT}
          </span>
        </div>
        <button
          type="button"
          className={styles.presentationCloseButton}
          onClick={onClose}
          aria-label="退出系统导览"
          data-testid="system-tour-close"
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>

      <div className={styles.presentationCanvasFrame}>
        <img
          key={currentImageSrc}
          src={currentImageSrc}
          alt={`系统导览第 ${currentPage} 页`}
          className={styles.presentationImage}
          data-testid="system-tour-image"
          draggable={false}
          onLoad={() => {
            loadedTourImages.add(currentPage);
            setImageLoading(false);
          }}
          onError={() => {
            setImageLoading(false);
            setLoadError("系统导览图片加载失败");
          }}
        />
        {imageLoading && !loadError ? (
          <div className={styles.presentationStatus} data-testid="system-tour-loading">
            <Loader2 aria-hidden="true" size={22} />
            <span>加载中</span>
          </div>
        ) : null}
        {loadError ? (
          <div className={styles.presentationError} role="alert">
            <span>系统导览图片加载失败，请打开原 PDF 查看。</span>
            <a className={styles.presentationFallbackLink} href={PDF_URL} target="_blank" rel="noreferrer">
              打开原 PDF
            </a>
          </div>
        ) : null}
      </div>

      <div className={styles.presentationPageButtons} aria-label="系统导览翻页">
        <button
          type="button"
          className={styles.presentationPageButton}
          onClick={goPrevious}
          disabled={currentPage <= 1}
          aria-label="上一页"
          data-testid="system-tour-prev"
        >
          <ChevronLeft aria-hidden="true" size={15} />
        </button>
        <button
          type="button"
          className={styles.presentationPageButton}
          onClick={goNext}
          disabled={currentPage >= TOUR_PAGE_COUNT}
          aria-label="下一页"
          data-testid="system-tour-next"
        >
          <ChevronRight aria-hidden="true" size={15} />
        </button>
      </div>
    </div>
  );
}
