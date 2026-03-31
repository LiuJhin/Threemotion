export {
  MotionTimeline,
  ThreeMotion,
  type MotionColorValue,
  type MotionColorVars,
  type MotionVectorVars,
  type Size,
  type ThreeMotionOptions,
  type ThreeObjectTweenVars,
  type TickCallback,
  type TickContext,
} from "./core/ThreeMotion";
export {
  CameraDirector,
  type DirectorLookAt,
  type DirectorShot,
  type DirectorTransitionOptions,
} from "./core/Director";
export {
  DEFAULT_MOTION_PRESET_NAMES,
  MotionPresetLibrary,
  type BuiltInMotionPresetName,
  type MotionAxis,
  type MotionPresetHandler,
  type MotionPresetName,
  type MotionPresetOptions,
  type MotionPresetState,
} from "./core/MotionPresets";
export { ScrollSync, type ScrollSyncOptions } from "./core/ScrollSync";
export {
  disposeRenderer,
  disposeThreeObject,
  getObjectMaterials,
  type DisposeThreeObjectOptions,
} from "./utils/dispose";
