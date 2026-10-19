import {Box3, Frustum, Matrix4, type Camera} from 'three';

/** Reuse the actual camera and a loaded figure's whole bounds, including its
 * height and weapons. A base can be off-screen while its head is still visible.
 * No mesh traversal, screen readback or extra rendering is needed. */
export function createMiniatureLodVisibility() {
  const frustum = new Frustum(), projection = new Matrix4(), worldBounds = new Box3();
  return {
    update(camera: Camera) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    },
    contains(bounds: Box3, matrixWorld: Matrix4) {
      return !bounds.isEmpty() && frustum.intersectsBox(worldBounds.copy(bounds).applyMatrix4(matrixWorld));
    },
  };
}
