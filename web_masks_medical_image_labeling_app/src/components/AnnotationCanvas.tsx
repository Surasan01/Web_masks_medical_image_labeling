import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnnotationPoint, AnnotationShape, DatasetItemDetail } from "../lib/types";
import { useLanguage } from "../contexts/LanguageContext";

type Tool = "bbox" | "polygon" | "freehand" | "select" | "erase";

interface AnnotationCanvasProps {
  datasetName: string;
  item: DatasetItemDetail;
  saving: boolean;
  onBack: () => void;
  onSave: (annotations: AnnotationShape[]) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onDownload: () => void | Promise<void>;
  onNextPending?: () => void | Promise<void>;
  canGoToNextPending?: boolean;
}

const COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
];

const MIN_BOX_SIZE = 8;
const DEFAULT_FILL_ALPHA = 0.18;
const SELECTED_FILL_ALPHA = 0.32;
const POLYGON_CLOSE_DISTANCE = 14;
const FREEHAND_CLOSE_DISTANCE = 12;

const MAX_UNDO_STACK = 50;

function cloneAnnotations(shapes: AnnotationShape[]): AnnotationShape[] {
  return shapes.map((shape) => ({
    ...shape,
    bbox: shape.bbox ? { ...shape.bbox } : undefined,
    points: shape.points ? shape.points.map((point) => ({ ...point })) : undefined,
  }));
}

function colorWithAlpha(color: string, alpha: number): string {
  if (!color.startsWith("#")) {
    return color;
  }

  let hex = color.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (hex.length !== 6) {
    return color;
  }

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ensureClosed(points: AnnotationPoint[], threshold: number): AnnotationPoint[] {
  if (points.length < 2) {
    return [...points];
  }

  const first = points[0];
  const last = points[points.length - 1];
  const distance = Math.hypot(last.x - first.x, last.y - first.y);

  if (distance === 0) {
    return [...points];
  }

  if (distance <= threshold) {
    const trimmed = points.slice(0, -1);
    return [...trimmed, first];
  }

  return [...points, first];
}

type Rect = { x: number; y: number; width: number; height: number };

function computeShapeBounds(shape: AnnotationShape): Rect | null {
  if (shape.bbox) {
    return { ...shape.bbox };
  }

  if (shape.points && shape.points.length > 0) {
    const xs = shape.points.map((point) => point.x);
    const ys = shape.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  return null;
}

function normalizeRect(start: AnnotationPoint, end: AnnotationPoint): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function generateAnnotationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ann-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function distancePointToSegment(point: AnnotationPoint, start: AnnotationPoint, end: AnnotationPoint): number {
  const l2 = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  if (l2 === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  let t = ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function isPointNearPolyline(point: AnnotationPoint, polyline: AnnotationPoint[], tolerance = 6): boolean {
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index];
    const end = polyline[index + 1];
    if (distancePointToSegment(point, start, end) <= tolerance) {
      return true;
    }
  }
  return false;
}

function isPointInPolygon(point: AnnotationPoint, polygon: AnnotationPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function AnnotationCanvas({
  datasetName,
  item,
  saving,
  onBack,
  onSave,
  onDelete,
  onDownload,
  onNextPending,
  canGoToNextPending = false,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const freehandPointsRef = useRef<AnnotationPoint[]>([]);
  const drawingColorRef = useRef<string>(COLORS[0]);
  const undoStackRef = useRef<AnnotationShape[][]>([]);
  const { t } = useLanguage();

  const [annotations, setAnnotations] = useState<AnnotationShape[]>(item.annotations ?? []);
  const [tool, setTool] = useState<Tool>("bbox");
  const [currentColor, setCurrentColor] = useState<string>(COLORS[0]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<AnnotationPoint | null>(null);
  const [draftShape, setDraftShape] = useState<AnnotationShape | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<AnnotationPoint[]>([]);
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
  const [activeModality, setActiveModality] = useState<"fat" | "water">("fat");
  const selectionStartRef = useRef<AnnotationPoint | null>(null);

  const toolRef = useRef<Tool>(tool);
  const polygonPointsRef = useRef<AnnotationPoint[]>(polygonPoints);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    polygonPointsRef.current = polygonPoints;
  }, [polygonPoints]);

  useEffect(() => {
    setAnnotations(item.annotations ?? []);
    setSelectedIds([]);
    setDraftShape(null);
    setPolygonPoints([]);
    setSelectionRect(null);
    selectionStartRef.current = null;
    setActiveModality("fat");
    undoStackRef.current = [];
  }, [item.id, item.annotations]);

  const pushUndoSnapshot = useCallback((snapshot: AnnotationShape[]) => {
    undoStackRef.current.push(cloneAnnotations(snapshot));
    if (undoStackRef.current.length > MAX_UNDO_STACK) {
      undoStackRef.current.shift();
    }
  }, []);

  const undoLastAnnotationChange = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    setAnnotations(previous);
    setSelectedIds([]);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && key === "z";
      if (!isUndo) return;

      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      const isEditable =
        Boolean(active?.isContentEditable) ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select";
      if (isEditable) return;

      event.preventDefault();

      if (toolRef.current === "polygon" && polygonPointsRef.current.length > 0) {
        setPolygonPoints((prev) => prev.slice(0, -1));
        return;
      }

      undoLastAnnotationChange();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoLastAnnotationChange]);

  useEffect(() => {
    if (!isDrawing && polygonPoints.length === 0) {
      drawingColorRef.current = currentColor;
    }
  }, [currentColor, isDrawing, polygonPoints.length]);

  useEffect(() => {
    setIsDrawing(false);
    setStartPos(null);
    setDraftShape(null);
    setPolygonPoints([]);
    setSelectionRect(null);
    selectionStartRef.current = null;
    freehandPointsRef.current = [];
    setSelectedIds((prev) => (tool === "select" ? prev : []));
  }, [tool]);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    if (image.clientWidth && image.clientHeight) {
      canvas.style.width = `${image.clientWidth}px`;
      canvas.style.height = `${image.clientHeight}px`;
    }
  }, []);

  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const width = image.naturalWidth || item.width;
    const height = image.naturalHeight || item.height || item.width;
    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${image.clientWidth}px`;
    canvas.style.height = `${image.clientHeight}px`;

    context.clearRect(0, 0, width, height);

    const selectedSet = new Set(selectedIds);
    const selectionPreviewIds = selectionRect
      ? new Set(
          annotations
            .filter((shape) => {
              const bounds = computeShapeBounds(shape);
              return bounds ? rectsIntersect(selectionRect, bounds) : false;
            })
            .map((shape) => shape.id),
        )
      : null;

    const drawShape = (shape: AnnotationShape, { dashed = false, selected = false } = {}) => {
      const color = shape.color ?? currentColor;
      const fillAlpha = selected ? SELECTED_FILL_ALPHA : DEFAULT_FILL_ALPHA;
      const fillColor = colorWithAlpha(color, fillAlpha);
      const bounds = computeShapeBounds(shape);

      context.save();
      context.strokeStyle = color;
      const strokeWidth = shape.type === "freehand" ? 1 : 0.75;
      context.lineWidth = strokeWidth;
      context.lineJoin = shape.type === "freehand" ? "round" : "miter";
      context.lineCap = shape.type === "freehand" ? "round" : "butt";
      if (dashed) {
        context.setLineDash([3, 3]);
      } else {
        context.setLineDash([]);
      }

      if (shape.bbox) {
        const { x, y, width: w, height: h } = shape.bbox;
        context.strokeRect(x, y, w, h);
        context.fillStyle = fillColor;
        context.fillRect(x, y, w, h);
      }

      if (shape.points && shape.points.length > 0) {
        context.beginPath();
        shape.points.forEach((point, index) => {
          if (index === 0) {
            context.moveTo(point.x, point.y);
          } else {
            context.lineTo(point.x, point.y);
          }
        });

        const shouldClosePath =
          (shape.type === "polygon" && shape.points.length > 1) ||
          (shape.type === "freehand" && !dashed && shape.points.length > 1);

        if (shouldClosePath) {
          context.closePath();
        }

        context.stroke();

        const shouldFill =
          shape.type === "polygon" ||
          (shape.type === "freehand" && shape.points.length > 2 && !dashed);

        if (shouldFill) {
          context.fillStyle = fillColor;
          context.fill();
        }
      }

      context.restore();

      if (selected && bounds && bounds.width >= 0 && bounds.height >= 0) {
        context.save();
        context.setLineDash([5, 3]);
        context.strokeStyle = colorWithAlpha(color, 0.7);
        context.lineWidth = 0.5;
        context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.restore();
      }
    };

    annotations.forEach((shape) => {
      const isSelected = selectedSet.has(shape.id) || Boolean(selectionPreviewIds?.has(shape.id));
      drawShape(shape, { selected: isSelected });
    });

    if (draftShape) {
      drawShape(draftShape, { dashed: true });
    }

    if (tool === "polygon" && polygonPoints.length > 0) {
      const preview: AnnotationShape = {
        id: "draft-polygon",
        type: "polygon",
        color: currentColor,
        points: polygonPoints,
      };
      drawShape(preview, { dashed: true });
      context.fillStyle = currentColor;
      polygonPoints.forEach((point, index) => {
        context.beginPath();
        const radius = index === 0 ? 6 : 4;
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        if (index === 0) {
          context.lineWidth = 1.5;
          context.strokeStyle = colorWithAlpha(currentColor, 0.7);
          context.stroke();
        }
      });
    }

    if (selectionRect) {
      context.save();
      context.setLineDash([3, 3]);
      context.strokeStyle = colorWithAlpha("#2563eb", 0.9);
      context.fillStyle = colorWithAlpha("#2563eb", 0.12);
      context.lineWidth = 0.5;
      context.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
      context.fillRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
      context.restore();
    }
  }, [annotations, currentColor, draftShape, item.height, item.width, polygonPoints, selectedIds, selectionRect, tool]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  useEffect(() => {
    const handleResize = () => {
      syncCanvasSize();
      drawOverlay();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawOverlay, syncCanvasSize]);

  const getCanvasCoordinates = (event: React.MouseEvent<HTMLCanvasElement>): AnnotationPoint => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = (image.naturalWidth || item.width) / rect.width;
    const scaleY = (image.naturalHeight || item.height || item.width) / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const findAnnotationAt = (point: AnnotationPoint): string | null => {
    for (let index = annotations.length - 1; index >= 0; index -= 1) {
      const shape = annotations[index];
      if (shape.bbox) {
        const { x, y, width, height } = shape.bbox;
        if (point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height) {
          return shape.id;
        }
      }
      if (shape.points && shape.points.length >= 3 && isPointInPolygon(point, shape.points)) {
        return shape.id;
      }
      if (shape.type === "freehand" && shape.points && shape.points.length >= 2) {
        if (isPointNearPolyline(point, shape.points, 8)) {
          return shape.id;
        }
      }
    }
    return null;
  };

  const appendFreehandPoint = (point: AnnotationPoint, force = false) => {
    const points = freehandPointsRef.current;
    const last = points[points.length - 1];
    const minDistance = 2;
    if (!last || force || Math.hypot(point.x - last.x, point.y - last.y) >= minDistance) {
      points.push(point);
      setDraftShape({
        id: "draft-freehand",
        type: "freehand",
        color: drawingColorRef.current,
        points: [...points],
      });
    }
  };

  const finalizeFreehand = () => {
    const points = freehandPointsRef.current;
    if (points.length < 2) {
      freehandPointsRef.current = [];
      setDraftShape(null);
      setIsDrawing(false);
      setStartPos(null);
      return;
    }

    const newShape: AnnotationShape = {
      id: generateAnnotationId(),
      type: "freehand",
      color: drawingColorRef.current,
      points: ensureClosed(points, FREEHAND_CLOSE_DISTANCE),
    };

    setAnnotations((prev) => {
      pushUndoSnapshot(prev);
      return [...prev, newShape];
    });
    setSelectedIds([newShape.id]);
    freehandPointsRef.current = [];
    setDraftShape(null);
    setIsDrawing(false);
    setStartPos(null);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const coords = getCanvasCoordinates(event);

    if (tool === "select") {
      selectionStartRef.current = coords;
      setIsDrawing(true);
      setSelectionRect({ x: coords.x, y: coords.y, width: 0, height: 0 });
      if (!event.shiftKey) {
        setSelectedIds([]);
      }
      return;
    }

    if (tool === "erase") {
      const found = findAnnotationAt(coords);
      if (found) {
        setAnnotations((prev) => {
          pushUndoSnapshot(prev);
          return prev.filter((shape) => shape.id !== found);
        });
        setSelectedIds((prev) => prev.filter((id) => id !== found));
      }
      return;
    }

    if (tool === "bbox") {
      setIsDrawing(true);
      drawingColorRef.current = currentColor;
      setStartPos(coords);
      setDraftShape({
        id: "draft-bbox",
        type: "bbox",
        color: currentColor,
        bbox: { x: coords.x, y: coords.y, width: 0, height: 0 },
      });
      return;
    }

    if (tool === "freehand") {
      setIsDrawing(true);
      drawingColorRef.current = currentColor;
      freehandPointsRef.current = [];
      appendFreehandPoint(coords, true);
      return;
    }

    if (tool === "polygon") {
      if (polygonPoints.length === 0) {
        drawingColorRef.current = currentColor;
      }
      if (polygonPoints.length >= 3) {
        const first = polygonPoints[0];
        const distance = Math.hypot(coords.x - first.x, coords.y - first.y);
        if (distance <= POLYGON_CLOSE_DISTANCE) {
          finalizePolygon(polygonPoints);
          return;
        }
      }

      setPolygonPoints((prev) => [...prev, coords]);
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(event);

    if (tool === "select" && selectionStartRef.current) {
      setSelectionRect(normalizeRect(selectionStartRef.current, coords));
      return;
    }

    if (!isDrawing) return;

    if (tool === "bbox" && startPos) {
      const bbox = {
        x: Math.min(startPos.x, coords.x),
        y: Math.min(startPos.y, coords.y),
        width: Math.abs(coords.x - startPos.x),
        height: Math.abs(coords.y - startPos.y),
      };

      setDraftShape({
        id: "draft-bbox",
        type: "bbox",
        color: drawingColorRef.current,
        bbox,
      });
      return;
    }

    if (tool === "freehand") {
      appendFreehandPoint(coords);
    }
  };

  const finalizeBoundingBox = (coords: AnnotationPoint) => {
    if (!startPos) return;

    const width = Math.abs(coords.x - startPos.x);
    const height = Math.abs(coords.y - startPos.y);
    if (width < MIN_BOX_SIZE || height < MIN_BOX_SIZE) {
      return;
    }

    const newShape: AnnotationShape = {
      id: generateAnnotationId(),
      type: "bbox",
      color: currentColor,
      bbox: {
        x: Math.min(startPos.x, coords.x),
        y: Math.min(startPos.y, coords.y),
        width,
        height,
      },
    };

    setAnnotations((prev) => {
      pushUndoSnapshot(prev);
      return [...prev, newShape];
    });
    setSelectedIds([newShape.id]);
  };

  const finalizePolygon = useCallback(
    (points: AnnotationPoint[]) => {
      if (points.length < 3) return;

      const newShape: AnnotationShape = {
        id: generateAnnotationId(),
        type: "polygon",
        color: drawingColorRef.current,
        points: ensureClosed(points, POLYGON_CLOSE_DISTANCE),
      };

      setAnnotations((prev) => {
        pushUndoSnapshot(prev);
        return [...prev, newShape];
      });
      setSelectedIds([newShape.id]);
      setPolygonPoints([]);
    },
    [pushUndoSnapshot],
  );

  const handleMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(event);

    if (tool === "select") {
      const start = selectionStartRef.current;
      const rect = selectionRect && start ? selectionRect : start ? normalizeRect(start, coords) : null;

      selectionStartRef.current = null;
      setSelectionRect(null);
      setIsDrawing(false);

      if (!start) {
        return;
      }

      const minDimension = rect ? Math.max(rect.width, rect.height) : 0;
      if (!rect || minDimension < 5) {
        const found = findAnnotationAt(coords);
        if (found) {
          setSelectedIds((prev) => {
            if (event.shiftKey) {
              return prev.includes(found) ? prev.filter((id) => id !== found) : [...prev, found];
            }
            return [found];
          });
        } else if (!event.shiftKey) {
          setSelectedIds([]);
        }
        return;
      }

      const matches = annotations
        .filter((shape) => {
          const bounds = computeShapeBounds(shape);
          return bounds ? rectsIntersect(rect, bounds) : false;
        })
        .map((shape) => shape.id);

      if (matches.length > 0) {
        setSelectedIds((prev) => {
          if (event.shiftKey) {
            const merged = new Set([...prev, ...matches]);
            return Array.from(merged);
          }
          return matches;
        });
      } else if (!event.shiftKey) {
        setSelectedIds([]);
      }
      return;
    }

    if (!isDrawing) return;

    if (tool === "bbox") {
      finalizeBoundingBox(coords);
      setIsDrawing(false);
      setStartPos(null);
      setDraftShape(null);
      return;
    }

    if (tool === "freehand") {
      appendFreehandPoint(coords, true);
      finalizeFreehand();
    }
  };

  const handleMouseLeave = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "select" && selectionStartRef.current) {
      handleMouseUp(event);
      return;
    }

    if (!isDrawing) return;
    if (tool === "bbox") {
      handleMouseUp(event);
    }
    if (tool === "freehand") {
      finalizeFreehand();
    }
  };

  const handleFinishPolygon = () => {
    finalizePolygon(polygonPoints);
  };

  const handleUndoPolygonPoint = () => {
    setPolygonPoints((prev) => prev.slice(0, -1));
  };

  const handleClearPolygon = () => {
    setPolygonPoints([]);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setAnnotations((prev) => {
      pushUndoSnapshot(prev);
      return prev.filter((shape) => !selectedIds.includes(shape.id));
    });
    setSelectedIds([]);
  };

  const handleSaveClick = () => {
    void Promise.resolve(onSave(annotations));
  };

  const handleDownloadClick = () => {
    void Promise.resolve(onDownload());
  };

  const handleDeleteClick = () => {
    void Promise.resolve(onDelete());
  };

  const handleNextPendingClick = () => {
    if (!onNextPending || !canGoToNextPending) {
      return;
    }
    void Promise.resolve(onNextPending());
  };

  const hasWater = Boolean(item.waterUrl);
  const effectiveModality = activeModality === "water" && hasWater ? "water" : "fat";
  const activeImageUrl = effectiveModality === "water" && hasWater ? item.waterUrl ?? item.imageUrl : item.imageUrl;
  const activeBadgeKey = effectiveModality === "water" ? "waterView" : "fatView";
  const referenceImageUrl = hasWater
    ? effectiveModality === "water"
      ? item.imageUrl
      : item.waterUrl ?? null
    : null;
  const referenceBadgeKey = effectiveModality === "water" ? "fatView" : "waterView";

  const handleModalityToggle = (mode: "fat" | "water") => {
    if (mode === "water" && !hasWater) {
      return;
    }
    setActiveModality(mode);
  };

  useEffect(() => {
    const imageElement = imageRef.current;
    if (imageElement && imageElement.complete) {
      syncCanvasSize();
      drawOverlay();
    }
  }, [activeImageUrl, drawOverlay, syncCanvasSize]);

  const annotationCount = useMemo(() => annotations.length, [annotations.length]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("backToImages")}
          </button>
          <div>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{datasetName}</p>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{item.filename}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadClick}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            {t("downloadItem")}
          </button>
          <button
            onClick={handleDeleteClick}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            {t("delete")}
          </button>
          <button
            onClick={handleSaveClick}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? t("saving") : t("save")}
          </button>
          {onNextPending && (
            <button
              onClick={handleNextPendingClick}
              disabled={!canGoToNextPending}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {t("nextPending")}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setTool("bbox")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tool === "bbox" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
              }`}
            >
              {t("boundingBox")}
            </button>
            <button
              onClick={() => setTool("polygon")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tool === "polygon" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
              }`}
            >
              {t("polygon")}
            </button>
            <button
              onClick={() => setTool("freehand")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tool === "freehand" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
              }`}
            >
              {t("freehand")}
            </button>
            <button
              onClick={() => setTool("select")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tool === "select" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
              }`}
            >
              {t("select")}
            </button>
            <button
              onClick={() => setTool("erase")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tool === "erase" ? "bg-red-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
              }`}
            >
              {t("erase")}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">{t("color")}</span>
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setCurrentColor(color)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${
                    currentColor === color ? "border-gray-900 scale-110" : "border-gray-300"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-300">{t("modalityToggleLabel")}</span>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => handleModalityToggle("fat")}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  effectiveModality === "fat"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                }`}
              >
                {t("useFat")}
              </button>
              <button
                onClick={() => handleModalityToggle("water")}
                disabled={!hasWater}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  effectiveModality === "water"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                } ${hasWater ? "" : "opacity-50 cursor-not-allowed"}`}
              >
                {t("useWater")}
              </button>
            </div>
          </div>

          {tool === "polygon" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleFinishPolygon}
                disabled={polygonPoints.length < 3}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {t("finishPolygon")} ({polygonPoints.length} {t("points")})
              </button>
              <button
                onClick={handleUndoPolygonPoint}
                disabled={polygonPoints.length === 0}
                className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {t("undo")}
              </button>
              <button
                onClick={handleClearPolygon}
                disabled={polygonPoints.length === 0}
                className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {t("clear")}
              </button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t("annotations")}: {annotationCount}
              {selectedIds.length > 0 ? ` · ${selectedIds.length} ${t("selected")}` : ""}
            </span>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.length === 0}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              {t("deleteSelection")}
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className={`flex flex-col gap-6${referenceImageUrl ? " lg:flex-row" : ""}`}>
            <div className="flex-1">
              <div className="relative bg-gray-900 rounded-2xl">
                <div className="overflow-auto max-h-[75vh] rounded-2xl">
                  <div className="relative inline-block">
                    <img
                      ref={imageRef}
                      src={activeImageUrl}
                      alt={t(activeBadgeKey)}
                      className="block max-w-full h-auto"
                      onLoad={() => {
                        syncCanvasSize();
                        drawOverlay();
                      }}
                    />
                    <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-blue-600/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                      {t(activeBadgeKey)}
                    </span>
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full cursor-crosshair"
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseLeave}
                    />
                  </div>
                </div>
              </div>
            </div>
            {referenceImageUrl && (
              <div className="flex-1 lg:max-w-sm xl:max-w-md">
                <div className="relative bg-gray-900 rounded-2xl overflow-hidden">
                  <img
                    src={referenceImageUrl}
                    alt={t(referenceBadgeKey)}
                    className="block w-full h-auto"
                  />
                  <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-cyan-500/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    {t(referenceBadgeKey)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t("maskPreview")}</h3>
          {item.maskUrl ? (
            <img
              src={item.maskUrl}
              alt="Mask preview"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700"
            />
          ) : (
            <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400">
              {t("maskPreviewEmpty")}
            </div>
          )}
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t("labelPreview")}</h3>
          {item.labelUrl ? (
            <img
              src={item.labelUrl}
              alt="Label preview"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700"
            />
          ) : (
            <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400">
              {t("labelPreviewEmpty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
