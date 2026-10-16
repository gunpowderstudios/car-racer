// Shrinks a textured car.gltf into a compact .glb: keeps geometry and UVs, compresses the mesh
// (meshopt + quantization) and turns the textures into 1024px WebP.
// Setup: npm i @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer sharp gl-matrix
// Usage: node tools/optimize-car.mjs cars/car.gltf cars/car-textured.glb
// OFF lines this particular model up with the old car.glb. For a different model, set it to [0, 0, 0]
// and re-measure the MODEL numbers in src/carVisual.js.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, textureCompress, prune, dedup, transformPrimitive, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mat4 } from 'gl-matrix';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot(), scene = root.listScenes()[0];
const OFF = [-2.4623, 14.3696, 3.7043]; // puts it exactly where car.glb sits, so MODEL measurements still apply
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = mat4.create(); mat4.translate(m, m, OFF); mat4.multiply(m, m, node.getWorldMatrix());
  for (const p of mesh.listPrimitives()) transformPrimitive(p, m);
  scene.listChildren().forEach(c => scene.removeChild(c));
  scene.addChild(doc.createNode('car').setMesh(mesh));
}
await doc.transform(
  prune(), dedup(), weld(), reorder({ encoder: MeshoptEncoder }),
  quantize({ quantizePosition: 14, quantizeTexcoord: 14, quantizeNormal: 10 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
  prune(),
);
root.listMaterials().forEach(m => m.setName('car'));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(process.argv[3], doc);
