/*
    File: packing.worker.js
    Description: Background worker for heavy bin packing calculations.
    Responsibility: 
    - Receive packing request
    - Perform calculations (CPU intensive)
    - Return result data (pure JSON)
    Constraints: NO DOM access, NO Three.js dependencies (unless strictly math-only)
*/

self.onmessage = function (e) {
  const { type, items, container } = e.data;

  if (type === 'START_PACKING') {
    console.log('[Worker] Received packing task:', items.length, 'items');

    const startTime = performance.now();
    const results = performPacking(items, container);
    const endTime = performance.now();

    console.log(`[Worker] Calculation took ${(endTime - startTime).toFixed(2)}ms`);

    // Send results back to main thread
    self.postMessage({
      type: 'PACKING_COMPLETE',
      results: results,
      stats: {
        timeMs: endTime - startTime,
        itemCount: results.length
      }
    });
  }
};

function performPacking(items, container) {
  const packedItems = [];

  // Simulation of a heavy algorithm
  // In a real scenario, this would be the complex bin packing logic.
  // Here we simulate "work" by iterating and calculating positions.

  // Simulate CPU load (optional, to demonstrate UI responsiveness)
  // const startBlock = performance.now();
  // while (performance.now() - startBlock < 1000) {
  //     // Busy wait for 1 second to simulate freezing if this was on main thread
  // }

  let currentX = 0;
  let currentY = 0;
  let currentZ = 0;
  let currentRowHeight = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Simple Shelf Packing Logic validation (just for demo visualization)
    if (currentX + item.width > container.width) {
      currentX = 0;
      currentZ += item.depth; // Move to next row
    }

    if (currentZ + item.depth > container.depth) {
      currentX = 0;
      currentZ = 0;
      currentY += 100; // Move up a layer (simplified)
    }

    // Add packed item result
    packedItems.push({
      id: item.id,
      // Position (center of the box for Three.js usually, but let's assume corner for calculation)
      // We'll adjust to center in main thread or here. Let's return corner coordinates.
      x: currentX,
      y: currentY,
      z: currentZ,
      width: item.width,
      height: item.height,
      depth: item.depth,
      color: item.color || Math.random() * 0xffffff
    });

    currentX += item.width;
  }

  return packedItems;
}
