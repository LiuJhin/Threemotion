import { type Material, Object3D, Texture, WebGLRenderer } from "three";

export interface DisposeThreeObjectOptions {
  removeFromParent?: boolean;
}

export function getObjectMaterials(object: Object3D): Material[] {
  const seen = new Set<Material>();
  const materials: Material[] = [];

  object.traverse((child) => {
    const material = (child as { material?: Material | Material[] }).material;
    const next = Array.isArray(material)
      ? material
      : material
        ? [material]
        : [];

    next.forEach((entry) => {
      if (!seen.has(entry)) {
        seen.add(entry);
        materials.push(entry);
      }
    });
  });

  return materials;
}

export function disposeThreeObject(
  object: Object3D,
  options: DisposeThreeObjectOptions = {},
): void {
  const disposedTextures = new Set<Texture>();
  const disposedMaterials = new Set<Material>();

  object.traverse((child) => {
    const geometry = (child as { geometry?: { dispose?: () => void } })
      .geometry;
    geometry?.dispose?.();

    const material = (child as { material?: Material | Material[] }).material;
    const materials = Array.isArray(material)
      ? material
      : material
        ? [material]
        : [];

    materials.forEach((entry) => {
      if (disposedMaterials.has(entry)) {
        return;
      }

      disposedMaterials.add(entry);

      Object.values(entry as unknown as Record<string, unknown>).forEach(
        (value) => {
          if (value instanceof Texture && !disposedTextures.has(value)) {
            disposedTextures.add(value);
            value.dispose();
          }
        },
      );

      entry.dispose();
    });
  });

  if (options.removeFromParent !== false) {
    object.removeFromParent();
  }
}

export function disposeRenderer(renderer: WebGLRenderer): void {
  renderer.renderLists.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}
