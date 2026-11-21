"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useInteractionReducedMotion } from "./hairline/ui-interaction-motion";

type Handle = { set: (value: number) => void; destroy: () => void };
type Figure = {
  mount: (
    elements: {
      stage: HTMLElement;
      svg: SVGSVGElement;
      read: { textContent: string | null };
    },
    value: number,
  ) => Handle;
  tour: ([number, number] | null)[];
};
type HairlineWindow = Window & {
  HL?: {
    inject: (root: Document) => void;
    tour: (
      stage: HTMLElement,
      stops: Figure["tour"],
      onStop?: () => void,
    ) => { stop: () => void };
  };
  hairline?: (definition: Figure) => void;
};
type Variant = "planning-table" | "garment-rack";
const figures: Partial<Record<Variant, Promise<Figure>>> = {};
let queue: Promise<unknown> = Promise.resolve();
function loadFigure(variant: Variant) {
  if (figures[variant]) return figures[variant]!;
  const figurePromise = queue.then(
    () =>
      new Promise<Figure>((resolve, reject) => {
        const scope = window as HairlineWindow;
        scope.hairline = resolve;
        const source = document.createElement("script");
        source.src = `/figures/${variant}.js`;
        source.type = "module";
        source.onerror = () => {
          delete figures[variant];
          reject(new Error("The planning illustration could not load."));
        };
        if (scope.HL) document.head.append(source);
        else {
          const kernel = document.createElement("script");
          kernel.src = "/figures/hairline-kernel.js";
          kernel.onload = () => document.head.append(source);
          kernel.onerror = source.onerror;
          document.head.append(kernel);
        }
      }),
  );
  figures[variant] = figurePromise;
  queue = figurePromise.catch(() => undefined);
  return figurePromise;
}

export function PlanningFigure({
  variant = "planning-table",
}: {
  variant?: Variant;
}) {
  const stage = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const tour = useRef<{ stop: () => void } | null>(null);
  const definition = useRef<Figure | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useInteractionReducedMotion();
  const playing =
    ready && visible && !paused && !hovered && !focused && !reduced;
  const [readout, setReadout] = useState("rest");
  const [error, setError] = useState(false);
  useEffect(() => {
    let mounted = true,
      handle: Handle | undefined;
    loadFigure(variant)
      .then((figure) => {
        if (!mounted || !stage.current || !svg.current) return;
        const scope = window as HairlineWindow;
        scope.HL!.inject(document);
        definition.current = figure;
        handle = figure.mount(
          {
            stage: stage.current,
            svg: svg.current,
            read: {
              get textContent() {
                return null;
              },
              set textContent(value) {
                if (mounted) setReadout(value ?? "rest");
              },
            },
          },
          18,
        );
        setReady(true);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
      tour.current?.stop();
      handle?.destroy();
    };
  }, [variant]);
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    let inView = false;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (!playing || !stage.current || !definition.current) return;
    tour.current = (window as HairlineWindow).HL!.tour(
      stage.current,
      definition.current.tour,
    );
    return () => {
      tour.current?.stop();
      tour.current = null;
    };
  }, [playing]);
  return (
    <figure
      className="planning-scene"
      aria-label={
        variant === "garment-rack"
          ? "Interactive garment rack illustration"
          : "Interactive garment planning illustration"
      }
      onPointerEnter={(event) => {
        if (event.isTrusted) setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.isTrusted) setHovered(false);
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div
        ref={stage}
        className="planning-stage"
        data-hairline={variant}
        data-playing={playing}
        role="img"
        aria-label={
          variant === "garment-rack"
            ? "Garments hanging on an isometric rail."
            : "Folded garments on a production table with two shipment trays. Hover or tap a tray to explore."
        }
      >
        <svg ref={svg} viewBox="0 0 400 320" aria-hidden="true" />
        <noscript>
          <p>
            Garments move from production into two shipment trays. Open the
            workspace to explore a real order.
          </p>
        </noscript>
      </div>
      <figcaption>
        <span>
          {error
            ? "Open the workspace to explore an order."
            : variant === "garment-rack"
              ? "Ready for your next commitment."
              : readout === "rest"
                ? "From production to shipment."
                : readout === "production"
                  ? "Preserve the work already completed."
                  : readout === "dispatch 1"
                    ? "Protect the first shipment."
                    : "Make room for the remaining pieces."}
        </span>
        {!reduced && (
          <button
            type="button"
            className="planning-play"
            disabled={error || !ready}
            aria-label={paused ? "Resume animation" : "Pause animation"}
            title={paused ? "Resume animation" : "Pause animation"}
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? (
              <Play size={14} aria-hidden="true" />
            ) : (
              <Pause size={14} aria-hidden="true" />
            )}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
