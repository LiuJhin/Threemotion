import { gsap } from "gsap";
import { Camera, Object3D, PerspectiveCamera, Vector3 } from "three";
import type {
  MotionVectorVars,
  ThreeMotion,
  ThreeObjectTweenVars,
} from "./ThreeMotion";

export type DirectorLookAt =
  | MotionVectorVars
  | Vector3
  | [number, number, number]
  | Object3D;

export interface DirectorShot {
  position?: MotionVectorVars;
  rotation?: MotionVectorVars;
  lookAt?: DirectorLookAt;
  fov?: number;
  zoom?: number;
}

export interface DirectorTransitionOptions extends Omit<
  ThreeObjectTweenVars,
  "scale" | "color" | "opacity"
> {
  lookAt?: DirectorLookAt;
  fov?: number;
  zoom?: number;
}

type ZoomableCamera = Camera & {
  zoom: number;
  updateProjectionMatrix: () => void;
};

function hasZoom(camera: Camera): camera is ZoomableCamera {
  return (
    "zoom" in camera &&
    typeof (camera as ZoomableCamera).updateProjectionMatrix === "function"
  );
}

function resolveLookAtTarget(
  value: DirectorLookAt,
  fallback?: Vector3,
): Vector3 {
  if (value instanceof Object3D) {
    return value.getWorldPosition(new Vector3());
  }

  if (value instanceof Vector3) {
    return value.clone();
  }

  if (Array.isArray(value)) {
    const [x = 0, y = 0, z = 0] = value;
    return new Vector3(x, y, z);
  }

  return new Vector3(
    value.x ?? fallback?.x ?? 0,
    value.y ?? fallback?.y ?? 0,
    value.z ?? fallback?.z ?? 0,
  );
}

function readCurrentLookAt(camera: Camera): Vector3 {
  const direction = new Vector3();
  camera.getWorldDirection(direction);
  return camera.position.clone().add(direction);
}

function mergeShot(
  base: DirectorShot,
  override?: Partial<DirectorShot>,
): DirectorShot {
  return {
    ...base,
    ...override,
    position: {
      ...base.position,
      ...override?.position,
    },
    rotation: {
      ...base.rotation,
      ...override?.rotation,
    },
    lookAt: override?.lookAt ?? base.lookAt,
    fov: override?.fov ?? base.fov,
    zoom: override?.zoom ?? base.zoom,
  };
}

export class CameraDirector {
  private readonly shots = new Map<string, DirectorShot>();
  private activeAnimation: gsap.core.Animation | null = null;

  constructor(private readonly motion: ThreeMotion) {}

  get names(): string[] {
    return [...this.shots.keys()];
  }

  defineShot(name: string, shot: DirectorShot): this {
    this.shots.set(name, shot);
    return this;
  }

  removeShot(name: string): this {
    this.shots.delete(name);
    return this;
  }

  clear(): this {
    this.shots.clear();
    return this;
  }

  has(name: string): boolean {
    return this.shots.has(name);
  }

  cutTo(target: string | DirectorShot, override?: Partial<DirectorShot>): this {
    this.activeAnimation?.kill();
    const shot = this.resolveShot(target, override);

    if (shot.position) {
      Object.assign(this.motion.camera.position, shot.position);
    }

    if (shot.rotation) {
      Object.assign(this.motion.camera.rotation, shot.rotation);
    }

    if (typeof shot.zoom === "number" && hasZoom(this.motion.camera)) {
      this.motion.camera.zoom = shot.zoom;
      this.motion.camera.updateProjectionMatrix();
    }

    if (
      typeof shot.fov === "number" &&
      this.motion.camera instanceof PerspectiveCamera
    ) {
      this.motion.camera.fov = shot.fov;
      this.motion.camera.updateProjectionMatrix();
    }

    if (shot.lookAt) {
      this.motion.camera.lookAt(resolveLookAtTarget(shot.lookAt));
    }

    this.motion.render();
    return this;
  }

  take(
    target: string | DirectorShot,
    options: DirectorTransitionOptions = {},
  ): gsap.core.Timeline {
    this.activeAnimation?.kill();
    const override: Partial<DirectorShot> = {
      position: options.position,
      rotation: options.rotation,
      lookAt: options.lookAt,
      fov: options.fov,
      zoom: options.zoom,
    };
    const shot = this.resolveShot(target, override);
    const timeline = gsap.timeline();

    this.addShotToTimeline(timeline, shot, options, 0);
    this.activeAnimation = timeline;
    return timeline;
  }

  dispose(): void {
    this.activeAnimation?.kill();
    this.activeAnimation = null;
    this.shots.clear();
  }

  private addShotToTimeline(
    timeline: gsap.core.Timeline,
    shot: DirectorShot,
    options: DirectorTransitionOptions,
    at: gsap.Position,
  ): void {
    const { lookAt, fov, zoom, ...tweenVars } = options;

    if (shot.position || shot.rotation) {
      this.motion.addToTimeline(
        timeline,
        this.motion.camera,
        {
          duration: 1.2,
          ease: "power2.inOut",
          ...tweenVars,
          position: shot.position,
          rotation: shot.rotation,
        },
        at,
      );
    }

    if (
      typeof shot.fov === "number" &&
      this.motion.camera instanceof PerspectiveCamera
    ) {
      const camera = this.motion.camera;

      timeline.to(
        camera,
        {
          duration: 1.2,
          ease: "power2.inOut",
          ...tweenVars,
          fov: shot.fov,
          onUpdate: () => {
            camera.updateProjectionMatrix();
          },
        },
        at,
      );
    }

    if (typeof shot.zoom === "number" && hasZoom(this.motion.camera)) {
      const camera = this.motion.camera;

      timeline.to(
        camera,
        {
          duration: 1.2,
          ease: "power2.inOut",
          ...tweenVars,
          zoom: shot.zoom,
          onUpdate: () => {
            camera.updateProjectionMatrix();
          },
        },
        at,
      );
    }

    if (shot.lookAt) {
      const lookAtProxy = readCurrentLookAt(this.motion.camera);
      const nextLookAt = resolveLookAtTarget(shot.lookAt, lookAtProxy);

      timeline.to(
        lookAtProxy,
        {
          duration: 1.2,
          ease: "power2.inOut",
          ...tweenVars,
          x: nextLookAt.x,
          y: nextLookAt.y,
          z: nextLookAt.z,
          onUpdate: () => {
            this.motion.camera.lookAt(lookAtProxy);
          },
        },
        at,
      );
    }
  }

  private resolveShot(
    target: string | DirectorShot,
    override?: Partial<DirectorShot>,
  ): DirectorShot {
    const base = typeof target === "string" ? this.shots.get(target) : target;

    if (!base) {
      throw new Error(`[ThreeMotion] Unknown camera shot \"${target}\".`);
    }

    return mergeShot(base, override);
  }
}
