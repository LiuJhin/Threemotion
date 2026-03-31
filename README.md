# ThreeMotion

A minimal bridge between `three` and `gsap` for responsive scenes, a GSAP-driven render loop, motion presets, and cinematic camera transitions.

## Install

```bash
pnpm add threemotion three gsap
```

> `three` and `gsap` are treated as `peerDependencies`.

## Quick Start

```ts
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { ThreeMotion } from "threemotion";

const container = document.querySelector("#app") as HTMLDivElement;

const motion = new ThreeMotion({
  container,
  clearColor: 0x0b1020,
});

const cube = new Mesh(
  new BoxGeometry(1, 1, 1),
  new MeshStandardMaterial({ color: "#8b5cf6" }),
);

const ambient = new AmbientLight("#ffffff", 1.5);
const sun = new DirectionalLight("#ffffff", 2);
sun.position.set(4, 6, 8);

motion.add(ambient, sun, cube);

motion.onTick(({ delta }) => {
  cube.rotation.x += delta * 0.35;
});

motion.to(cube, {
  position: { y: 1.2 },
  rotation: { y: Math.PI },
  color: "#22d3ee",
  duration: 1.2,
  ease: "power2.out",
});
```

## Motion Presets

Built-in presets include `fadeInUp`, `popIn`, `spinIn`, and `float`.

```ts
motion.playPreset("fadeInUp", cube, {
  duration: 0.9,
  distance: 1.5,
  ease: "power3.out",
});

motion.playPreset("float", cube, {
  axis: "y",
  distance: 0.2,
  amount: 0.06,
});
```

You can also register your own preset:

```ts
motion.registerPreset("heroReveal", (target, options, ctx) => {
  ctx.set(target, {
    opacity: 0,
    scale: { x: 0.85, y: 0.85, z: 0.85 },
  });

  return ctx.to(target, {
    opacity: 1,
    scale: { x: 1, y: 1, z: 1 },
    duration: 0.8,
    ease: "back.out(1.6)",
    ...options,
  });
});
```

## Director Mode

Define reusable camera shots and transition between them like film cuts.

```ts
motion
  .defineShot("wide", {
    position: { x: 0, y: 2, z: 8 },
    lookAt: [0, 0, 0],
    fov: 45,
  })
  .defineShot("closeup", {
    position: { x: 1.4, y: 0.8, z: 2.6 },
    lookAt: cube,
    fov: 32,
  });

motion.cutTo("wide");

motion.transitionTo("closeup", {
  duration: 1.4,
  ease: "power2.inOut",
});
```

## ScrollSync

Drive Three.js transforms from the native HTML scroll bar with GSAP `scrub` smoothing.

```ts
const scroll = motion.scrollSync({
  trigger: ".story",
  start: "top top",
  end: "+=2400",
  scrub: 1.2,
  pin: true,
});

scroll
  .to(
    cube,
    {
      position: { y: 1.5, z: -2 },
      rotation: { y: Math.PI * 1.5 },
      ease: "none",
    },
    0,
  )
  .shot(
    {
      position: { x: 0, y: 1.2, z: 4 },
      lookAt: cube,
      fov: 38,
    },
    { duration: 1, ease: "none" },
    0.35,
  )
  .to(
    cube,
    {
      position: { y: -1 },
      rotation: { x: Math.PI * 0.5 },
      ease: "none",
    },
    0.7,
  );
```

## Cleanup

Always dispose when tearing down a scene to avoid GPU leaks and GSAP ticker buildup.

```ts
motion.dispose();
```
