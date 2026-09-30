import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

// Exercise the exact decoder used by gltfjsx's texture pipeline.
const require = createRequire(import.meta.url);
const gltfRequire = createRequire(require.resolve('gltfjsx'));
const functionsRequire = createRequire(gltfRequire.resolve('@gltf-transform/functions'));
const pixelsPath = functionsRequire.resolve('ndarray-pixels');
const pixelsRequire = createRequire(pixelsPath);
const { getPixels } = await import(pathToFileURL(pixelsPath).href);
const sharp = pixelsRequire('sharp');

test('patched texture decoder retains RGBA pixels', async () => {
  const png = await sharp(Buffer.from([255, 0, 0, 255, 0, 255, 0, 128]), {
    raw: { width: 2, height: 1, channels: 4 },
  }).png().toBuffer();
  const pixels = await getPixels(png, 'image/png');
  assert.deepEqual(pixels.shape, [2, 1, 4]);
  assert.equal(pixels.get(0, 0, 0), 255);
  assert.equal(pixels.get(1, 0, 1), 255);
  assert.equal(pixels.get(1, 0, 3), 128);
});

test('invalid texture data is rejected', async () => {
  await assert.rejects(getPixels(Buffer.from('invalid PNG'), 'image/png'));
});
