"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import styles from "./login-pixel.module.css";

const PDF_URL = "/demo/huiyu-tongxing.pdf";
const PDF_WORKER_URL = "/vendor/pdfjs/pdf.worker.mjs";

type DemoPdfPresentationProps = {
  open: boolean;
  onClose: () => void;
};

function clampPage(page: number, pageCount: number) {
  if (pageCount <= 0) return 1;
  return Math.min(Math.max(page, 1), pageCount);
}

export default function DemoPdfPresentation({ open, onClose }: DemoPdfPresentationProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [viewportTick, setViewportTick] = useState(0);

  const goNext = useCallback(() => {
    setCurrentPage((prev) => clampPage(prev + 1, pageCount));
  }, [pageCount]);

  const goPrevious = useCallback(() => {
    setCurrentPage((prev) => clampPage(prev - 1, pageCount));
  }, [pageCount]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus({ preventScroll: true });
    overlayRef.current?.requestFullscreen?.().catch(() => undefined);

    return () => {
      document.body.style.overflow = previousOverflow;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleFullscreenChange() {
      if (!document.fullscreenElement) onClose();
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [onClose, open]);

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

    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setPageCount(0);
    setCurrentPage(1);

    async function loadPdf() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        const loadingTask = pdfjs.getDocument(PDF_URL);
        loadingTaskRef.current = loadingTask;
        const documentProxy = await loadingTask.promise;

        if (cancelled) {
          await documentProxy.destroy();
          return;
        }

        pdfDocRef.current = documentProxy;
        setPageCount(documentProxy.numPages);
        setCurrentPage(1);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "PDF 加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      void loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
      void pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const frame = canvasFrameRef.current;
    if (!frame) return;

    const resizeObserver = new ResizeObserver(() => {
      setViewportTick((value) => value + 1);
    });
    resizeObserver.observe(frame);

    return () => resizeObserver.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || !pdfDocRef.current || !pageCount) return;

    let cancelled = false;
    const canvasElement = canvasRef.current;
    const frameElement = canvasFrameRef.current;
    const pdfDoc = pdfDocRef.current;
    if (!canvasElement || !frameElement) return;

    async function renderPage(canvas: HTMLCanvasElement, frame: HTMLDivElement) {
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      setRendering(true);

      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const frameRect = frame.getBoundingClientRect();
        const maxWidth = Math.max(frameRect.width, 320);
        const maxHeight = Math.max(frameRect.height, 180);
        const scale = Math.min(maxWidth / baseViewport.width, maxHeight / baseViewport.height);
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas 渲染上下文不可用");
        }

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvas,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          background: "white",
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          setLoadError(error instanceof Error ? error.message : "PDF 页面渲染失败");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    void renderPage(canvasElement, frameElement);

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [currentPage, open, pageCount, viewportTick]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className={styles.presentationOverlay}
      data-testid="demo-presentation-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="演示模式"
      tabIndex={-1}
    >
      <div className={styles.presentationTopBar}>
        <div className={styles.presentationMeta}>
          <span className={styles.presentationTitle}>演示模式</span>
          <span className={styles.presentationPageCount} data-testid="demo-presentation-page-count">
            {pageCount ? `${currentPage} / ${pageCount}` : "加载中"}
          </span>
        </div>
        <button
          type="button"
          className={styles.presentationCloseButton}
          onClick={onClose}
          aria-label="退出演示模式"
          data-testid="demo-presentation-close"
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>

      <div ref={canvasFrameRef} className={styles.presentationCanvasFrame}>
        <canvas ref={canvasRef} className={styles.presentationCanvas} data-testid="demo-presentation-canvas" />
        {(loading || rendering) && !loadError ? (
          <div className={styles.presentationStatus} data-testid="demo-presentation-loading">
            <Loader2 aria-hidden="true" size={22} />
            <span>加载中</span>
          </div>
        ) : null}
        {loadError ? (
          <div className={styles.presentationError} role="alert">
            {loadError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
