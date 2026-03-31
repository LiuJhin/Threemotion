import { gsap } from "gsap";
import {
  Camera,
  Color,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
  type ColorRepresentation,
} from "three";
import {
  DEFAULT_CAMERA_POSITION_Z,
  DEFAULT_CLEAR_COLOR,
  DEFAULT_FAR,
  DEFAULT_FOV,
  DEFAULT_NEAR,
  DEFAULT_PIXEL_RATIO_CAP,
} from "../constants/defaults";
import {
  disposeRenderer,
  disposeThreeObject,
  getObjectMaterials,
} from "../utils/dispose";
import {
  CameraDirector,
  type DirectorShot,
  type DirectorTransitionOptions,
} from "./Director";
import {
  MotionPresetLibrary,
  type MotionPresetHandler,
  type MotionPresetName,
  type MotionPresetOptions,
} from "./MotionPresets";
import { ScrollSync, type ScrollSyncOptions } from "./ScrollSync";

export interface Size {
  width: number;
  height: number;
}

export interface TickContext {
  time: number;
  delta: number;
  frame: number;
}

export type TickCallback = (context: TickContext, motion: ThreeMotion) => void;
export type MotionVectorVars = Partial<Record<"x" | "y" | "z", number>>;
export type MotionColorVars = Partial<Record<"r" | "g" | "b", number>>;
export type MotionColorValue = ColorRepresentation | MotionColorVars;

export type ThreeObjectTweenVars = Omit<gsap.TweenVars, "rotation"> & {
  position?: MotionVectorVars;
  rotation?: MotionVectorVars;
  scale?: MotionVectorVars;
  color?: MotionColorValue;
  opacity?: number;
};

export interface ThreeMotionOptions {
  container?: HTMLElement | null;
  canvas?: HTMLCanvasElement | null;
  scene?: Scene;
  camera?: Camera;
  renderer?: WebGLRenderer;
  autoStart?: boolean;
  autoRender?: boolean;
  antialias?: boolean;
  alpha?: boolean;
  clearColor?: ColorRepresentation;
  pixelRatioCap?: number;
}

const GSAP_OPTION_KEYS = new Set([
  "callbackScope",
  "delay",
  "duration",
  "ease",
  "id",
  "immediateRender",
  "inherit",
  "keyframes",
  "lazy",
  "onComplete",
  "onCompleteParams",
  "onRepeat",
  "onRepeatParams",
  "onReverseComplete",
  "onReverseCompleteParams",
  "onStart",
  "onStartParams",
  "onUpdate",
  "onUpdateParams",
  "overwrite",
  "paused",
  "repeat",
  "repeatDelay",
  "repeatRefresh",
  "snap",
  "stagger",
  "startAt",
  "yoyo",
  "yoyoEase",
]);

const TIMELINE_ONLY_KEYS = new Set([
  "callbackScope",
  "onComplete",
  "onCompleteParams",
  "onRepeat",
  "onRepeatParams",
  "onReverseComplete",
  "onReverseCompleteParams",
  "onStart",
  "onStartParams",
  "onUpdate",
  "onUpdateParams",
  "paused",
]);

const NESTED_MOTION_KEYS = new Set([
  "position",
  "rotation",
  "scale",
  "color",
  "opacity",
]);

function isObject3DTarget(value: unknown): value is Object3D {
  return value instanceof Object3D;
}

function hasNestedMotionVars(vars: ThreeObjectTweenVars): boolean {
  return Object.keys(vars).some((key) => NESTED_MOTION_KEYS.has(key));
}

function normalizeColor(value: MotionColorValue): MotionColorVars {
  if (value instanceof Color) {
    return { r: value.r, g: value.g, b: value.b };
  }

  if (typeof value === "string" || typeof value === "number") {
    const color = new Color(value);
    return { r: color.r, g: color.g, b: color.b };
  }

  return value;
}

function splitTweenVars(vars: Record<string, unknown>): {
  tweenOptions: gsap.TweenVars;
  timelineOptions: gsap.TimelineVars;
  directTargetVars: Record<string, unknown>;
} {
  const tweenOptions: gsap.TweenVars = {};
  const timelineOptions: gsap.TimelineVars = {};
  const directTargetVars: Record<string, unknown> = {};

  Object.entries(vars).forEach(([key, value]) => {
    if (TIMELINE_ONLY_KEYS.has(key)) {
      (timelineOptions as Record<string, unknown>)[key] = value;
      return;
    }

    if (GSAP_OPTION_KEYS.has(key)) {
      (tweenOptions as Record<string, unknown>)[key] = value;
      return;
    }

    directTargetVars[key] = value;
  });

  return { tweenOptions, timelineOptions, directTargetVars };
}

/**
 * Minimal Three.js + GSAP bridge driven by a single GSAP ticker.
 *
 * @example
 * const motion = new ThreeMotion({ container: el }).add(mesh);
 * motion.to(mesh, {
 *   position: { y: 1.5 },
 *   rotation: { y: Math.PI },
 *   color: '#7c3aed',
 *   duration: 1.2,
 *   ease: 'power2.out',
 * });
 */
export class MotionTimeline {
  readonly native: gsap.core.Timeline;

  constructor(
    private readonly motion: ThreeMotion,
    vars: gsap.TimelineVars = {},
  ) {
    this.native = gsap.timeline(vars);
  }

  to(
    target: object,
    vars: ThreeObjectTweenVars,
    position?: gsap.Position,
  ): this {
    this.motion.addToTimeline(this.native, target, vars, position);
    return this;
  }

  set(
    target: object,
    vars: ThreeObjectTweenVars,
    position?: gsap.Position,
  ): this {
    this.motion.addToTimeline(
      this.native,
      target,
      { ...vars, duration: 0 },
      position,
    );
    return this;
  }

  call(
    callback: (...args: unknown[]) => void,
    params?: unknown[],
    position?: gsap.Position,
  ): this {
    this.native.call(callback as gsap.Callback, params, position);
    return this;
  }

  add(child: gsap.core.Animation | string, position?: gsap.Position): this {
    this.native.add(child as never, position);
    return this;
  }

  play(): this {
    this.native.play();
    return this;
  }

  pause(atTime?: number | string): this {
    this.native.pause(atTime);
    return this;
  }

  seek(position: number | string, suppressEvents = true): this {
    this.native.seek(position, suppressEvents);
    return this;
  }

  kill(): this {
    this.native.kill();
    return this;
  }
}

export class ThreeMotion {
  readonly scene: Scene;
  readonly camera: Camera;
  readonly renderer: WebGLRenderer;
  readonly size = new Vector2(1, 1);
  readonly presets: MotionPresetLibrary;
  readonly director: CameraDirector;

  private readonly container: HTMLElement | null;
  private readonly autoRender: boolean;
  private readonly tickCallbacks = new Set<TickCallback>();
  private readonly scrollSyncs = new Set<ScrollSync>();
  private readonly handleResize = (): void => {
    this.resize();
  };
  private readonly handleTick = (
    time: number,
    deltaMs: number,
    frame: number,
  ): void => {
    if (!this.started || this.disposed) {
      return;
    }

    const context: TickContext = {
      time,
      delta: deltaMs / 1000,
      frame,
    };

    this.tickCallbacks.forEach((callback) => callback(context, this));

    if (this.autoRender) {
      this.render();
    }
  };

  private resizeObserver?: ResizeObserver;
  private pixelRatioCap: number;
  private started = false;
  private disposed = false;

  constructor(options: ThreeMotionOptions = {}) {
    const canvas = options.canvas ?? undefined;

    this.container = options.container ?? canvas?.parentElement ?? null;
    this.scene = options.scene ?? new Scene();
    this.camera =
      options.camera ??
      new PerspectiveCamera(DEFAULT_FOV, 1, DEFAULT_NEAR, DEFAULT_FAR);
    this.renderer =
      options.renderer ??
      new WebGLRenderer({
        canvas,
        antialias: options.antialias ?? true,
        alpha: options.alpha ?? true,
      });
    this.autoRender = options.autoRender ?? true;
    this.pixelRatioCap = options.pixelRatioCap ?? DEFAULT_PIXEL_RATIO_CAP;
    this.presets = new MotionPresetLibrary(this);
    this.director = new CameraDirector(this);

    if (this.camera instanceof PerspectiveCamera) {
      this.camera.position.z ||= DEFAULT_CAMERA_POSITION_Z;
    }

    if (!options.renderer) {
      this.renderer.setClearColor(
        options.clearColor ?? DEFAULT_CLEAR_COLOR,
        options.alpha ? 0 : 1,
      );
    }

    if (
      !canvas &&
      this.container &&
      this.renderer.domElement.parentElement !== this.container
    ) {
      this.container.appendChild(this.renderer.domElement);
    }

    this.resize();
    this.bindResize();

    if (options.autoStart !== false) {
      this.start();
    }
  }

  add(...objects: Object3D[]): this {
    objects.forEach((object) => this.scene.add(object));
    return this;
  }

  remove(...objects: Object3D[]): this {
    objects.forEach((object) => this.scene.remove(object));
    return this;
  }

  onTick(callback: TickCallback): this {
    this.tickCallbacks.add(callback);
    return this;
  }

  offTick(callback: TickCallback): this {
    this.tickCallbacks.delete(callback);
    return this;
  }

  start(): this {
    if (this.started || this.disposed) {
      return this;
    }

    gsap.ticker.add(this.handleTick);
    this.started = true;
    return this;
  }

  stop(): this {
    if (!this.started) {
      return this;
    }

    gsap.ticker.remove(this.handleTick);
    this.started = false;
    return this;
  }

  render(): this {
    this.renderer.render(this.scene, this.camera);
    return this;
  }

  resize(nextSize?: Partial<Size>): this {
    const fallback = this.readContainerSize();
    const width = Math.max(1, Math.floor(nextSize?.width ?? fallback.width));
    const height = Math.max(1, Math.floor(nextSize?.height ?? fallback.height));

    this.size.set(width, height);
    this.renderer.setPixelRatio(this.readPixelRatio());
    this.renderer.setSize(width, height, false);

    if (this.camera instanceof PerspectiveCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    return this;
  }

  setPixelRatio(cap: number): this {
    this.pixelRatioCap = cap;
    this.renderer.setPixelRatio(this.readPixelRatio());
    return this;
  }

  registerPreset(name: MotionPresetName, handler: MotionPresetHandler): this {
    this.presets.register(name, handler);
    return this;
  }

  playPreset(
    name: MotionPresetName,
    target: Object3D,
    options?: MotionPresetOptions,
  ): gsap.core.Animation {
    return this.presets.play(name, target, options);
  }

  defineShot(name: string, shot: DirectorShot): this {
    this.director.defineShot(name, shot);
    return this;
  }

  cutTo(target: string | DirectorShot, override?: Partial<DirectorShot>): this {
    this.director.cutTo(target, override);
    return this;
  }

  transitionTo(
    target: string | DirectorShot,
    options?: DirectorTransitionOptions,
  ): gsap.core.Timeline {
    return this.director.take(target, options);
  }

  createScrollSync(options?: ScrollSyncOptions): ScrollSync {
    const sync = new ScrollSync(this, options);
    this.scrollSyncs.add(sync);
    return sync;
  }

  scrollSync(options?: ScrollSyncOptions): ScrollSync {
    return this.createScrollSync(options);
  }

  /**
   * Internal cleanup hook used by `ScrollSync.kill()`.
   */
  detachScrollSync(sync: ScrollSync): void {
    this.scrollSyncs.delete(sync);
  }

  to(
    target: object,
    vars: ThreeObjectTweenVars,
    position?: gsap.Position,
  ): gsap.core.Tween | gsap.core.Timeline {
    if (!isObject3DTarget(target) || !hasNestedMotionVars(vars)) {
      return gsap.to(target as gsap.TweenTarget, vars as gsap.TweenVars);
    }

    const timeline = gsap.timeline();
    this.addToTimeline(timeline, target, vars, position);
    return timeline;
  }

  set(target: object, vars: ThreeObjectTweenVars): this {
    if (!isObject3DTarget(target) || !hasNestedMotionVars(vars)) {
      gsap.set(target as gsap.TweenTarget, vars as gsap.TweenVars);
      return this;
    }

    const timeline = gsap.timeline();
    this.addToTimeline(timeline, target, { ...vars, duration: 0 });
    return this;
  }

  timeline(vars?: gsap.TimelineVars): MotionTimeline {
    return new MotionTimeline(this, vars);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.stop();
    this.resizeObserver?.disconnect();

    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.handleResize);
    }

    this.scene.traverse((child: Object3D) => {
      const materialColor = this.readColorTarget(child);
      gsap.killTweensOf(
        [
          child,
          child.position,
          child.rotation,
          child.scale,
          materialColor,
        ].filter(Boolean),
      );
    });

    [...this.scene.children].forEach((child) => disposeThreeObject(child));
    [...this.scrollSyncs].forEach((sync) => sync.kill(false));
    this.scrollSyncs.clear();
    this.tickCallbacks.clear();
    this.director.dispose();
    this.presets.clear();
    disposeRenderer(this.renderer);
    this.disposed = true;
  }

  /**
   * Internal helper used by `MotionTimeline` so Object3D nested props stay chainable.
   */
  addToTimeline(
    timeline: gsap.core.Timeline,
    target: object,
    vars: ThreeObjectTweenVars,
    position: gsap.Position = 0,
  ): gsap.core.Timeline {
    if (!isObject3DTarget(target) || !hasNestedMotionVars(vars)) {
      timeline.to(target as gsap.TweenTarget, vars as gsap.TweenVars, position);
      return timeline;
    }

    const object3D = target as Object3D;
    const {
      position: positionVars,
      rotation,
      scale,
      color,
      opacity,
      ...rest
    } = vars;
    const { tweenOptions, timelineOptions, directTargetVars } = splitTweenVars(
      rest as Record<string, unknown>,
    );
    const segment = gsap.timeline(timelineOptions);

    if (Object.keys(directTargetVars).length > 0) {
      segment.to(target as gsap.TweenTarget, {
        ...tweenOptions,
        ...directTargetVars,
      });
    }

    // GSAP interpolates primitive numeric channels.
    // For Three.js classes we tween their live Vector/Euler/Color channels directly
    // (`x/y/z` or `r/g/b`) so no temporary objects are allocated every frame.
    if (positionVars) {
      segment.to(object3D.position, { ...tweenOptions, ...positionVars }, 0);
    }

    if (rotation) {
      segment.to(object3D.rotation, { ...tweenOptions, ...rotation }, 0);
    }

    if (scale) {
      segment.to(object3D.scale, { ...tweenOptions, ...scale }, 0);
    }

    if (color !== undefined) {
      const colorTarget = this.readColorTarget(object3D);
      if (colorTarget) {
        segment.to(
          colorTarget,
          { ...tweenOptions, ...normalizeColor(color) },
          0,
        );
      }
    }

    if (opacity !== undefined) {
      getObjectMaterials(object3D).forEach((material) => {
        material.transparent = true;
        segment.to(material, { ...tweenOptions, opacity }, 0);
      });
    }

    timeline.add(segment, position);
    return timeline;
  }

  private bindResize(): void {
    const observedElement =
      this.container ?? this.renderer.domElement.parentElement;

    if (observedElement && typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(observedElement);
      return;
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.handleResize, { passive: true });
    }
  }

  private readContainerSize(): Size {
    const element = this.container ?? this.renderer.domElement.parentElement;

    if (element) {
      const width =
        element.clientWidth || element.getBoundingClientRect().width;
      const height =
        element.clientHeight || element.getBoundingClientRect().height;

      if (width > 0 && height > 0) {
        return { width, height };
      }
    }

    if (typeof window !== "undefined") {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }

    return { width: 1, height: 1 };
  }

  private readPixelRatio(): number {
    if (typeof window === "undefined") {
      return 1;
    }

    return Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
  }

  private readColorTarget(target: Object3D): Color | null {
    if ("color" in target && target.color instanceof Color) {
      return target.color;
    }

    const material = getObjectMaterials(target).find(
      (entry): entry is typeof entry & { color: Color } =>
        "color" in entry && entry.color instanceof Color,
    );

    return material?.color ?? null;
  }
}
