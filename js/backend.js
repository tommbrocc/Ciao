/*
 * Picks the fastest TensorFlow.js backend available: WebGL (GPU), then
 * WebAssembly, then plain JavaScript as a last resort.
 */
(function (global) {
  'use strict';

  async function tryBackend(tf, name) {
    try {
      if (!(await tf.setBackend(name))) return false;
      await tf.ready();
      return tf.getBackend() === name;
    } catch (_) {
      return false;
    }
  }

  async function init(wasmPath, only) {
    const tf = faceapi.tf;
    if (tf.setWasmPaths) tf.setWasmPaths(wasmPath);
    const order = only ? [only] : ['webgl', 'wasm', 'cpu'];
    for (const name of order) {
      if (await tryBackend(tf, name)) return name;
    }
    throw new Error('No TensorFlow.js backend could be initialised');
  }

  global.FaceBackend = { init };
})(typeof window !== 'undefined' ? window : globalThis);
