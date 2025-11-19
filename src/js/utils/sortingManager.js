/**
 * sortingManager.js
 * 
 * This module provides functions for sorting 3D objects based on a multi-level priority system.
 * It handles sorting by spatial coordinates (x, y, z), applying a directional weight,
 * and considering a LIFO (Last-In, First-Out) index.
 */

/**
 * Sorts an array of 3D objects based on specified criteria.
 * 
 * @param {Array<THREE.Object3D>} objects - The array of Three.js objects to sort. Each object is expected to have a `position` Vector3 and a `userData` object.
 * @param {object} options - The sorting options.
 * @param {string} options.sortOrder - The primary axis sort order (e.g., 'x>y>z' or 'y>x>z').
 * @param {string} options.doorDirection - The direction of the door ('front', 'back', 'left', 'right') which affects z-axis priority.
 * @param {boolean} options.lifoEnabled - Whether to apply LIFO sorting based on `userData.packIndex`.
 * @returns {Array<THREE.Object3D>} A new array with the sorted objects.
 */
export function sortObjects(objects, { sortOrder = 'x>y>z', doorDirection = 'front', lifoEnabled = false }) {
    // Create a shallow copy to avoid modifying the original array
    const sortedObjects = [...objects];

    // Determine the weight for the z-axis based on door direction.
    // This logic assumes 'front' is +Z, 'back' is -Z, etc.
    // A negative weight prioritizes items with a larger coordinate value on that axis.
    let zWeight = 1; // Default: smaller z is higher priority
    if (doorDirection === 'front') { // +Z is door, we want larger Z values first
        zWeight = -1;
    }
    // Note: 'back' (-Z) defaultly prioritizes smaller Z, which is correct.
    // TODO: Implement 'left' and 'right' which would affect the x-axis sorting.

    sortedObjects.sort((a, b) => {
        let result = 0;

        // Primary sorting based on user's choice
        if (sortOrder === 'y>x>z') {
            result = a.position.y - b.position.y || a.position.x - b.position.x;
        } else { // Default to 'x>y>z'
            result = a.position.x - b.position.x || a.position.y - b.position.y;
        }

        // Secondary sort by Z-axis with door weight
        if (result === 0) {
            result = (a.position.z - b.position.z) * zWeight;
        }

        // Tertiary sort by LIFO index if enabled
        if (result === 0 && lifoEnabled) {
            // Assuming a `packIndex` exists in userData. Lower index = higher priority.
            const indexA = a.userData.packIndex ?? Infinity;
            const indexB = b.userData.packIndex ?? Infinity;
            result = indexA - indexB;
            if (result !== 0) {
                console.log('LIFO sorting applied.');
            }
        }

        return result;
    });

    console.log('Sorting complete with options:', { sortOrder, doorDirection, lifoEnabled });
    return sortedObjects;
}
