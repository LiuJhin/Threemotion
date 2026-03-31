import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Object3D } from "three";
import type { DirectorShot, DirectorTransitionOptions } from "./Director";
import type { ThreeMotion, ThreeObjectTweenVars } from "./ThreeMotion";

let scrollTriggerRegistered = false;

function ensureScrollTrigger(): void {
  if (typeof window === "undefined") {
    throw new Error(
      "[ThreeMotion] ScrollSync requires a browser environment with window/document.",
    );
  }

  if (!scrollTriggerRegistered) {
    gsap.registerPlugin(ScrollTrigger);
    scrollTriggerRegistered = true;
  }
}

export interface ScrollSyncOptions {
  trigger?: gsap.DOMTarget;
  endTrigger?: gsap.DOMTarget;
  start?: string | number;
  end?: string | number;
  scrub?: boolean | number;
  pin?: boolean | gsap.DOMTarget;
  pinSpacing?: boolean;
  markers?: boolean;
  snap?: number | number[];
  anticipatePin?: number;
  invalidateOnRefresh?: boolean;
  fastScrollEnd?: boolean;
  id?: string;
  defaults?: gsap.TweenVars;
  onUpdate?: (self: ScrollTrigger) => void;
}

/**
 * Scroll-driven motion composer.
 *
 * Internally it maps HTML scroll progress to a GSAP timeline via ScrollTrigger's
 * `scrub` option, so Three.js transforms follow the scrollbar smoothly instead of
 * snapping frame-by-frame.
 */
export class ScrollSync {
  readonly timeline: gsap.core.Timeline;
  readonly scrollTrigger: ScrollTrigger;

  constructor(
    private readonly motion: ThreeMotion,
    options: ScrollSyncOptions = {},
  ) {
    ensureScrollTrigger();

    const trigger =
      options.trigger ??
      this.motion.renderer.domElement.parentElement ??
      this.motion.renderer.domElement;

    this.timeline = gsap.timeline({
      paused: true,
      defaults: options.defaults,
    });

    this.scrollTrigger = ScrollTrigger.create({
      id: options.id,
      animation: this.timeline,
      trigger,
      endTrigger: options.endTrigger,
      start: options.start ?? "top top",
      end: options.end ?? "+=1500",
      scrub: options.scrub ?? 1,
      pin: options.pin ?? false,
      pinSpacing: options.pinSpacing,
      markers: options.markers ?? false,
      snap: options.snap,
      anticipatePin: options.anticipatePin ?? 1,
      invalidateOnRefresh: options.invalidateOnRefresh ?? true,
      fastScrollEnd: options.fastScrollEnd,
      onUpdate: (self) => {
        this.motion.render();
        options.onUpdate?.(self);
      },
    });
  }

  to(
    target: object,
    vars: ThreeObjectTweenVars,
    position?: gsap.Position,
  ): this {
    this.motion.addToTimeline(this.timeline, target, vars, position);
    return this;
  }

  set(
    target: object,
    vars: ThreeObjectTweenVars,
    position?: gsap.Position,
  ): this {
    this.motion.addToTimeline(
      this.timeline,
      target,
      { ...vars, duration: 0 },
      position,
    );
    return this;
  }

  fromTo(
    target: object,
    fromVars: ThreeObjectTweenVars,
    toVars: ThreeObjectTweenVars,
    position?: gsap.Position,
  ): this {
    this.set(target, fromVars, position);
    this.to(target, toVars, position);
    return this;
  }

  shot(
    target: string | DirectorShot,
    options?: DirectorTransitionOptions,
    position?: gsap.Position,
  ): this {
    this.motion.director.addToTimeline(
      this.timeline,
      target,
      options,
      position,
    );
    return this;
  }

  add(animation: gsap.core.Animation | string, position?: gsap.Position): this {
    this.timeline.add(animation as never, position);
    return this;
  }

  call(
    callback: (...args: unknown[]) => void,
    params?: unknown[],
    position?: gsap.Position,
  ): this {
    this.timeline.call(callback as gsap.Callback, params, position);
    return this;
  }

  label(name: string, position?: gsap.Position): this {
    this.timeline.addLabel(name, position);
    return this;
  }

  refresh(): this {
    this.scrollTrigger.refresh();
    return this;
  }

  enable(reset = false): this {
    this.scrollTrigger.enable(reset);
    return this;
  }

  disable(revert = false, allowAnimation = true): this {
    this.scrollTrigger.disable(revert, allowAnimation);
    return this;
  }

  get progress(): number {
    return this.timeline.progress();
  }

  kill(revert = true): void {
    this.scrollTrigger.kill(revert);
    this.timeline.kill();
    this.motion.detachScrollSync(this);
  }
}
