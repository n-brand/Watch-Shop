// Compresses a .glb exported by three.js (GLTFExporter) for the version history; used by server.js.
// Also usable on its own: node tools/compress-glb.js <input.glb> <output.glb>
// Pipeline as for the stored versions v001-v019:
//   weld (bitwise identical vertices only), WebP for textures (PNG lossless, so the Lumen display and prints stay
//   pixel-identical; JPEG lossy), meshopt with 16-bit positions last. Any step after meshopt would decode it again.
// Not used on purpose: dedup (merges equal materials with different names, which the configurator needs) and
// optimize (joins nodes). Needs the packages from package.json (npm install).
const fs = require('node:fs');

async function compressGlb(input) {
  const [{ NodeIO, Logger }, { ALL_EXTENSIONS }, { weld, textureCompress, meshopt, unpartition }, { MeshoptEncoder, MeshoptDecoder }, { default: sharp }] =
    await Promise.all([
      import('@gltf-transform/core'),
      import('@gltf-transform/extensions'),
      import('@gltf-transform/functions'),
      import('meshoptimizer'),
      import('sharp'),
    ]);
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.ERROR))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

  const doc = await io.readBinary(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
  await doc.transform(
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', formats: /^image\/png$/, lossless: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', formats: /^image\/jpeg$/ }),
    meshopt({ encoder: MeshoptEncoder, quantizePosition: 16 }),
    unpartition(),
  );
  return Buffer.from(await io.writeBinary(doc));
}

module.exports = { compressGlb };

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node tools/compress-glb.js <input.glb> <output.glb>');
    process.exit(1);
  }
  compressGlb(fs.readFileSync(input)).then((data) => {
    fs.writeFileSync(output, data);
    console.log(`${input} (${(fs.statSync(input).size / 1024).toFixed(0)} KB) -> ${output} (${(data.length / 1024).toFixed(0)} KB)`);
  });
}
