import { gsap } from "gsap";
import { Object3D } from "three";
import type {
  MotionColorValue,
  MotionVectorVars,
  ThreeMotion,
  ThreeObjectTweenVars,
} from "./ThreeMotion";

export const DEFAULT_MOTION_PRESET_NAMES = [
  "fadeInUp",
  "popIn",
  "spinIn",
  "float",
] as const;

export type BuiltInMotionPresetName =
  (typeof DEFAULT_MOTION_PRESET_NAMES)[number];
export type MotionPresetName = BuiltInMotionPresetName | (string & {});
export type MotionAxis = "x" | "y" | "z";

export interface MotionPresetState {
  position?: MotionVectorVars;
  rotation?: MotionVectorVars;
  scale?: MotionVectorVars;
  color?: MotionColorValue;
  opacity?: number;
}

export interface MotionPresetOptions extends Omit<
  ThreeObjectTweenVars,
  "position" | "rotation" | "scale" | "color" | "opacity"
> {
  duration?: number;
  ease?: string;
  axis?: MotionAxis;
  distance?: number;
  amount?: number;
  from?: MotionPresetState;
  to?: MotionPresetState;
}

export type MotionPresetHandler<
  T extends MotionPresetOptions = MotionPresetOptions,
> = (target: Object3D, options: T, motion: ThreeMotion) => gsap.core.Animation;

function readVectorState(value: {
  x: number;
  y: number;
  z: number;
}): Required<MotionVectorVars> {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}

function stripPresetOptions(
  options: MotionPresetOptions,
): Omit<
  ThreeObjectTweenVars,
  "position" | "rotation" | "scale" | "color" | "opacity"
> {
  const { axis, distance, amount, from, to, ...tweenVars } = options;
  return tweenVars;
}

function scaleWithMultiplier(
  scale: Required<MotionVectorVars>,
  multiplier: number,
): MotionVectorVars {
  return {
    x: Math.max(0.0001, scale.x * multiplier),
    y: Math.max(0.0001, scale.y * multiplier),
    z: Math.max(0.0001, scale.z * multiplier),
  };
}

function buildFadeInUp(
  target: Object3D,
  options: MotionPresetOptions,
  motion: ThreeMotion,
): gsap.core.Animation {
  const axis = options.axis ?? "y";
  const distance = options.distance ?? 1;
  const currentPosition = readVectorState(target.position);
  const tweenVars = stripPresetOptions(options);

  motion.set(target, {
    position: {
      ...currentPosition,
      [axis]: currentPosition[axis] - distance,
      ...options.from?.position,
    },
    opacity: options.from?.opacity ?? 0,
    rotation: options.from?.rotation,
    scale: options.from?.scale,
    color: options.from?.color,
  });

  return motion.to(target, {
    duration: 0.9,
    ease: "power3.out",
    ...tweenVars,
    position: {
      [axis]: currentPosition[axis],
      ...options.to?.position,
    },
    opacity: options.to?.opacity ?? 1,
    rotation: options.to?.rotation,
    scale: options.to?.scale,
    color: options.to?.color,
  });
}

function buildPopIn(
  target: Object3D,
  options: MotionPresetOptions,
  motion: ThreeMotion,
): gsap.core.Animation {
  const currentScale = readVectorState(target.scale);
  const overshoot = 1 + (options.amount ?? 0.12);
  const duration = options.duration ?? 0.8;
  const ease = options.ease ?? "power2.out";
  const tweenVars = stripPresetOptions(options);
  const timeline = motion.timeline();

  motion.set(target, {
    scale: options.from?.scale ?? scaleWithMultiplier(currentScale, 0.001),
    opacity: options.from?.opacity ?? 0,
    position: options.from?.position,
    rotation: options.from?.rotation,
    color: options.from?.color,
  });

  timeline.to(target, {
    ...tweenVars,
    duration: duration * 0.65,
    ease,
    scale: options.to?.scale ?? scaleWithMultiplier(currentScale, overshoot),
    opacity: options.to?.opacity ?? 1,
    position: options.to?.position,
    rotation: options.to?.rotation,
    color: options.to?.color,
  });

  timeline.to(target, {
    ...tweenVars,
    duration: duration * 0.35,
    ease: "back.out(1.7)",
    scale: {
      ...currentScale,
      ...options.to?.scale,
    },
  });

  return timeline.native;
}

function buildSpinIn(
  target: Object3D,
  options: MotionPresetOptions,
  motion: ThreeMotion,
): gsap.core.Animation {
  const axis = options.axis ?? "y";
  const amount = options.amount ?? Math.PI;
  const currentRotation = readVectorState(target.rotation);
  const currentScale = readVectorState(target.scale);
  const tweenVars = stripPresetOptions(options);

  motion.set(target, {
    rotation: {
      ...currentRotation,
      [axis]: currentRotation[axis] - amount,
      ...options.from?.rotation,
    },
    scale: options.from?.scale ?? scaleWithMultiplier(currentScale, 0.75),
    opacity: options.from?.opacity ?? 0,
    position: options.from?.position,
    color: options.from?.color,
  });

  return motion.to(target, {
    duration: 1.1,
    ease: "power2.out",
    ...tweenVars,
    rotation: {
      [axis]: currentRotation[axis],
      ...options.to?.rotation,
    },
    scale: {
      ...currentScale,
      ...options.to?.scale,
    },
    opacity: options.to?.opacity ?? 1,
    position: options.to?.position,
    color: options.to?.color,
  });
}

function buildFloat(
  target: Object3D,
  options: MotionPresetOptions,
  motion: ThreeMotion,
): gsap.core.Animation {
  const axis = options.axis ?? "y";
  const distance = options.distance ?? 0.25;
  const amount = options.amount ?? 0.08;
  const currentPosition = readVectorState(target.position);
  const currentRotation = readVectorState(target.rotation);
  const tweenVars = stripPresetOptions(options);

  return motion.to(target, {
    duration: 1.8,
    ease: "sine.inOut",
    repeat: -1,
    yoyo: true,
    ...tweenVars,
    position: {
      [axis]: currentPosition[axis] + distance,
      ...options.to?.position,
    },
    rotation: {
      z: currentRotation.z + amount,
      ...options.to?.rotation,
    },
  });
}

export class MotionPresetLibrary {
  private readonly presets = new Map<MotionPresetName, MotionPresetHandler>();

  constructor(private readonly motion: ThreeMotion) {
    this.registerDefaults();
  }

  get names(): MotionPresetName[] {
    return [...this.presets.keys()];
  }

  register(name: MotionPresetName, handler: MotionPresetHandler): this {
    this.presets.set(name, handler);
    return this;
  }

  unregister(name: MotionPresetName): this {
    this.presets.delete(name);
    return this;
  }

  has(name: MotionPresetName): boolean {
    return this.presets.has(name);
  }

  clear(): this {
    this.presets.clear();
    return this;
  }

  play(
    name: MotionPresetName,
    target: Object3D,
    options: MotionPresetOptions = {},
  ): gsap.core.Animation {
    const handler = this.presets.get(name);

    if (!handler) {
      throw new Error(
        `[ThreeMotion] Unknown motion preset \"${name}\". Registered presets: ${this.names.join(", ")}`,
      );
    }

    return handler(target, options, this.motion);
  }

  private registerDefaults(): void {
    this.register("fadeInUp", buildFadeInUp);
    this.register("popIn", buildPopIn);
    this.register("spinIn", buildSpinIn);
    this.register("float", buildFloat);
  }
}
