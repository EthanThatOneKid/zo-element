import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { describeZopackStatus, type Corner, type ZopackContextValue, useZopackContext } from "./zopack-context";

const STORAGE_KEY = "zo-element:indicator-corner";
const INDICATOR_SIZE = 48;
const INDICATOR_MARGIN = 16;
const PANEL_GAP = 12;
const PANEL_MAX_WIDTH = "min(92vw, 72rem)";
const PANEL_MAX_HEIGHT = "calc(100vh - 32px)";
const PEGASUS_URL = "https://www.zo.computer/pegasus.svg";
const PEGASUS_WHITE_URL = "https://www.zo.computer/pegasus-white.svg";

function isCorner(value: string | null): value is Corner {
  return value === "bottom-right" || value === "bottom-left" || value === "top-right" || value === "top-left";
}

function loadCorner(): Corner {
  if (typeof window === "undefined") return "bottom-right";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isCorner(stored) ? stored : "bottom-right";
}

function persistCorner(corner: Corner): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, corner);
}

function getCornerFromPoint(x: number, y: number): Corner {
  const right = x > window.innerWidth / 2;
  const bottom = y > window.innerHeight / 2;
  return `${bottom ? "bottom" : "top"}-${right ? "right" : "left"}` as Corner;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function indicatorStyle(corner: Corner): CSSProperties {
  const base: CSSProperties = {
    position: "fixed",
    zIndex: 2147483646,
  };

  switch (corner) {
    case "bottom-right":
      return { ...base, right: INDICATOR_MARGIN, bottom: INDICATOR_MARGIN };
    case "bottom-left":
      return { ...base, left: INDICATOR_MARGIN, bottom: INDICATOR_MARGIN };
    case "top-right":
      return { ...base, right: INDICATOR_MARGIN, top: INDICATOR_MARGIN };
    case "top-left":
    default:
      return { ...base, left: INDICATOR_MARGIN, top: INDICATOR_MARGIN };
  }
}

function dragIndicatorStyle(position: { x: number; y: number }): CSSProperties {
  return {
    position: "fixed",
    left: position.x,
    top: position.y,
    zIndex: 2147483646,
    transition: "none",
  };
}

function panelStyle(corner: Corner): CSSProperties {
  const offset = INDICATOR_MARGIN + INDICATOR_SIZE + PANEL_GAP;
  const base: CSSProperties = {
    position: "fixed",
    zIndex: 2147483645,
    width: PANEL_MAX_WIDTH,
    maxWidth: "calc(100vw - 32px)",
    maxHeight: PANEL_MAX_HEIGHT,
  };

  switch (corner) {
    case "bottom-right":
      return { ...base, right: INDICATOR_MARGIN, bottom: offset };
    case "bottom-left":
      return { ...base, left: INDICATOR_MARGIN, bottom: offset };
    case "top-right":
      return { ...base, right: INDICATOR_MARGIN, top: offset };
    case "top-left":
    default:
      return { ...base, left: INDICATOR_MARGIN, top: offset };
  }
}

export interface ZopackIndicatorProps {
  renderPanel: (context: ZopackContextValue) => ReactNode;
}

export function ZopackIndicator({ renderPanel }: ZopackIndicatorProps) {
  const context = useZopackContext();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({ active: false, pointerId: -1, offsetX: 0, offsetY: 0, moved: false });
  const suppressClickRef = useRef(false);
  const [corner, setCorner] = useState<Corner>(() => loadCorner());
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const activeContext = context;

  useEffect(() => {
    if (!activeContext) return;
    if (!activeContext.isOpen) return;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      activeContext!.closePanel();
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [activeContext]);

  if (!activeContext) return null;

  const badge = describeZopackStatus(activeContext.status);
  const isDragging = dragStateRef.current.active;
  const indicatorBoxStyle = dragPosition ? dragIndicatorStyle(dragPosition) : indicatorStyle(corner);

  function setPersistedCorner(next: Corner) {
    setCorner(next);
    persistCorner(next);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!activeContext || activeContext.isOpen || event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    setDragPosition({ x: rect.left, y: rect.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState.active) return;

    const nextX = Math.max(0, Math.min(window.innerWidth - INDICATOR_SIZE, event.clientX - dragState.offsetX));
    const nextY = Math.max(0, Math.min(window.innerHeight - INDICATOR_SIZE, event.clientY - dragState.offsetY));
    if (Math.abs(nextX - (dragPosition?.x ?? nextX)) > 2 || Math.abs(nextY - (dragPosition?.y ?? nextY)) > 2) {
      dragState.moved = true;
    }
    setDragPosition({ x: nextX, y: nextY });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState.active) return;

    dragState.active = false;
    setDragPosition(null);

    if (event.currentTarget.hasPointerCapture(dragState.pointerId)) {
      event.currentTarget.releasePointerCapture(dragState.pointerId);
    }

    if (!dragState.moved) return;

    suppressClickRef.current = true;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextCorner = getCornerFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setPersistedCorner(nextCorner);
  }

  function handleClick(event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    activeContext!.togglePanel();
  }

  return (
    <div ref={rootRef} data-zo-element-root="true" data-zo-element-corner={corner} data-zo-element-open={activeContext.isOpen}>
      <button
        type="button"
        aria-label={activeContext.isOpen ? `Close ${activeContext.label}` : activeContext.label}
        aria-expanded={activeContext.isOpen}
        data-zo-element-status={activeContext.status}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
          style={{
            ...indicatorBoxStyle,
          width: INDICATOR_SIZE,
          height: INDICATOR_SIZE,
          padding: 0,
          border: "1px solid rgba(15, 23, 42, 0.16)",
          borderRadius: 14,
          background: "rgba(255, 255, 255, 0.96)",
          boxShadow: "0 14px 32px rgba(0, 0, 0, 0.2)",
          cursor: isDragging ? "grabbing" : activeContext.isOpen ? "pointer" : "grab",
          touchAction: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <img
          src={activeContext.isOpen ? PEGASUS_WHITE_URL : PEGASUS_URL}
          alt="Zo"
          width={28}
          height={28}
          draggable={false}
          style={{ pointerEvents: "none", userSelect: "none" }}
        />
        <span
          aria-hidden="true"
          data-zo-element-badge={activeContext.status}
          title={badge.label}
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 10,
            height: 10,
            borderRadius: 9999,
            background: badge.color,
            border: "1.5px solid white",
            boxSizing: "border-box",
            opacity: badge.pulse ? 0.92 : 1,
            boxShadow: badge.pulse ? `0 0 0 3px ${hexToRgba(badge.color, 0.18)}` : "none",
          }}
        />
      </button>

      {context.isOpen ? (
        <div
          role="dialog"
          aria-label="Zo live editor"
          data-zo-element-panel="true"
          data-zo-element-status={activeContext.status}
          style={panelStyle(corner)}
        >
          {renderPanel(activeContext)}
        </div>
      ) : null}
    </div>
  );
}
