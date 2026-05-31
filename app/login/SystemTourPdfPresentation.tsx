"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preload } from "react-dom";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import styles from "./login-pixel.module.css";

const PDF_URL = "/demo/huiyu-tongxing.pdf";
const TOUR_IMAGE_BASE_URL = "/demo/system-tour/v3";
const TOUR_PREVIEW_BASE_URL = `${TOUR_IMAGE_BASE_URL}/preview`;
const TOUR_DISPLAY_BASE_URL = `${TOUR_IMAGE_BASE_URL}/display`;
const TOUR_PAGE_COUNT = 22;
const TOUR_PAGES = Array.from({ length: TOUR_PAGE_COUNT }, (_, index) => index + 1);
const ENTRY_PRELOAD_PAGES = [1, 2, 3];

type SystemTourPdfPresentationProps = {
  open: boolean;
  onClose: () => void;
};

type ImagePriority = "high" | "low" | "auto";

const loadedImageUrls = new Set<string>();
const pendingImageLoads = new Map<string, Promise<void>>();
const loadedPreviewPages = new Set<number>();
const loadedDisplayPages = new Set<number>();
let allDisplayWarmupPromise: Promise<void> | null = null;

function clampPage(page: number, pageCount: number) {
  if (pageCount <= 0) return 1;
  return Math.min(Math.max(page, 1), pageCount);
}

function getPageFileName(page: number, extension: "avif" | "webp") {
  return `page-${String(page).padStart(2, "0")}.${extension}`;
}

function getPreviewAvifUrl(page: number) {
  return `${TOUR_PREVIEW_BASE_URL}/${getPageFileName(page, "avif")}`;
}

function getPreviewWebpUrl(page: number) {
  return `${TOUR_PREVIEW_BASE_URL}/${getPageFileName(page, "webp")}`;
}

function getDisplayAvifUrl(page: number) {
  return `${TOUR_DISPLAY_BASE_URL}/${getPageFileName(page, "avif")}`;
}

function getDisplayWebpUrl(page: number) {
  return `${TOUR_DISPLAY_BASE_URL}/${getPageFileName(page, "webp")}`;
}

function isValidTourPage(page: number) {
  return page >= 1 && page <= TOUR_PAGE_COUNT;
}

function setImageFetchPriority(image: HTMLImageElement, priority: ImagePriority) {
  if ("fetchPriority" in image) {
    (image as HTMLImageElement & { fetchPriority: ImagePriority }).fetchPriority = priority;
  }
}

function preloadImageUrl(url: string, priority: ImagePriority) {
  if (typeof window === "undefined" || loadedImageUrls.has(url)) {
    return Promise.resolve();
  }

  const pending = pendingImageLoads.get(url);
  if (pending) return pending;

  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    setImageFetchPriority(image, priority);
    image.onload = () => {
      loadedImageUrls.add(url);
      pendingImageLoads.delete(url);
      resolve();
    };
    image.onerror = () => {
      pendingImageLoads.delete(url);
      reject(new Error(`System tour image failed to load: ${url}`));
    };
    image.src = url;
  });

  pendingImageLoads.set(url, promise);
  return promise;
}

function preloadTourPreviewPage(page: number, priority: ImagePriority) {
  if (!isValidTourPage(page) || loadedPreviewPages.has(page)) return Promise.resolve();

  return preloadImageUrl(getPreviewAvifUrl(page), priority)
    .catch(() => preloadImageUrl(getPreviewWebpUrl(page), priority))
    .then(() => {
      loadedPreviewPages.add(page);
    });
}

function preloadTourDisplayPage(page: number, priority: ImagePriority) {
  if (!isValidTourPage(page) || loadedDisplayPages.has(page)) return Promise.resolve();

  return preloadImageUrl(getDisplayAvifUrl(page), priority)
    .catch(() => preloadImageUrl(getDisplayWebpUrl(page), priority))
    .then(() => {
      loadedDisplayPages.add(page);
    });
}

function scheduleIdleTask(run: () => void, timeout: number) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(run, { timeout });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = globalThis.setTimeout(run, Math.min(timeout, 300));
  return () => globalThis.clearTimeout(timeoutId);
}

function warmAllDisplayPages() {
  if (allDisplayWarmupPromise) return allDisplayWarmupPromise;

  allDisplayWarmupPromise = TOUR_PAGES.reduce<Promise<void>>(
    (previous, page) =>
      previous.then(() =>
        preloadTourDisplayPage(page, page <= 3 ? "high" : "low").catch(() => undefined),
      ),
    Promise.resolve(),
  );

  return allDisplayWarmupPromise;
}

export function preloadSystemTourEntry() {
  if (typeof window === "undefined") return;

  for (const page of ENTRY_PRELOAD_PAGES) {
    void preloadTourDisplayPage(page, page === 1 ? "high" : "low").catch(() => undefined);
  }

  void preloadTourPreviewPage(1, "low").catch(() => undefined);
}

function scheduleInitialPreload() {
  const run = () => preloadSystemTourEntry();
  return scheduleIdleTask(run, 900);
}

export default function SystemTourPdfPresentation({ open, onClose }: SystemTourPdfPresentationProps) {
  preload(getDisplayAvifUrl(1), { as: "image", type: "image/avif", fetchPriority: "high" });

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

  const currentPreviewAvifSrc = useMemo(() => getPreviewAvifUrl(currentPage), [currentPage]);
  const currentPreviewWebpSrc = useMemo(() => getPreviewWebpUrl(currentPage), [currentPage]);
  const currentDisplayAvifSrc = useMemo(() => getDisplayAvifUrl(currentPage), [currentPage]);
  const currentDisplayWebpSrc = useMemo(() => getDisplayWebpUrl(currentPage), [currentPage]);

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

    preloadSystemTourEntry();
    const resetTimer = window.setTimeout(() => {
      setCurrentPage(1);
      setLoadError("");
    }, 0);

    const cancelWarmup = scheduleIdleTask(() => {
      void warmAllDisplayPages();
    }, 450);

    return () => {
      window.clearTimeout(resetTimer);
      cancelWarmup();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const nearbyPages = [currentPage, currentPage + 1, currentPage - 1, currentPage + 2];

    const loadingTimer = window.setTimeout(() => {
      if (cancelled) return;
      setLoadError("");
      setImageLoading(!loadedDisplayPages.has(currentPage));
    }, 0);

    void preloadTourDisplayPage(currentPage, "high")
      .then(() => {
        if (!cancelled) setImageLoading(false);
      })
      .catch((error) => {
        if (!cancelled) {
          setImageLoading(false);
          setLoadError(error instanceof Error ? error.message : "系统导览图片加载失败");
        }
      });

    void preloadTourPreviewPage(currentPage, "low").catch(() => undefined);

    for (const page of nearbyPages) {
      void preloadTourDisplayPage(page, page === currentPage ? "high" : "low").catch(() => undefined);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
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
          <span className={styles.presentationTitle}>慧育童行系统导览</span>
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
        {imageLoading && !loadError ? (
          <picture className={styles.presentationPreviewPicture}>
            <source srcSet={currentPreviewAvifSrc} type="image/avif" />
            <img
              src={currentPreviewWebpSrc}
              alt=""
              className={styles.presentationImage}
              draggable={false}
              width={560}
              height={420}
              decoding="async"
            />
          </picture>
        ) : null}

        <picture key={currentDisplayWebpSrc} className={styles.presentationPicture}>
          <source srcSet={currentDisplayAvifSrc} type="image/avif" />
          <img
            src={currentDisplayWebpSrc}
            alt={`系统导览第 ${currentPage} 页`}
            className={styles.presentationImage}
            data-testid="system-tour-image"
            draggable={false}
            width={1200}
            height={900}
            decoding="async"
            fetchPriority={currentPage === 1 ? "high" : "auto"}
            onLoad={(event) => {
              loadedImageUrls.add(event.currentTarget.currentSrc || currentDisplayWebpSrc);
              loadedDisplayPages.add(currentPage);
              setImageLoading(false);
            }}
            onError={() => {
              setImageLoading(false);
              setLoadError("系统导览图片加载失败");
            }}
          />
        </picture>

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
