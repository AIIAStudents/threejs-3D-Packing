import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { formatMetric } from './updateProgressDisplay.js';
import { forceUpdateDOM } from './updateDOM.js';
import { getContainer } from '../container/containerManager.js';

let isProcessing = false;

export function processPackedObjects(
  packedObjects,
  utilization,
  executionTime,
  forceUpdateScene,
  objectManager,
  updateProgressDisplay
) {
    if (isProcessing) {
        console.warn('🔄 Aborting packing process: another process is already running.');
        return;
    }
    isProcessing = true;

    try {
        const containerMesh = getContainer();
        if (!containerMesh) {
            throw new Error('Container mesh not found! Packing process cannot continue.');
        }

        const sceneItems = objectManager.getSceneObjects();
        
        // Create a map for quick lookup of scene items by their ID
        const sceneItemsMap = new Map();
        sceneItems.forEach(item => {
            const itemId = item.userData?.id ? String(item.userData.id) : null;
            if (itemId) {
                sceneItemsMap.set(itemId, item);
            }
        });

        // --- Main loop to process each packed object ---
        packedObjects.forEach(packedObj => {
            const packedId = String(packedObj.uuid);
            const sceneItem = sceneItemsMap.get(packedId);

            if (!sceneItem) {
                console.warn(`⚠️ Scene object with ID ${packedId} not found. Skipping.`);
                return;
            }

            const mesh = sceneItem;
            const body = mesh.userData.body;

            // The backend returns a 'pose' with world coordinates. We need to find the center.
            const pose = packedObj.pose;
            if (!pose || !pose.min || !pose.max) {
                console.error(`❌ Object ${packedId} has an invalid pose from the backend. Skipping.`, packedObj);
                return;
            }

            // --- Coordinate System Correction ---
            // The backend calculates positions from (0,0,0) in the positive octant.
            // The frontend places the container centered at (0,y,0). We must offset.
            const containerSize = new THREE.Vector3();
            new THREE.Box3().setFromObject(containerMesh).getSize(containerSize);
            const offset = new THREE.Vector3(containerSize.x / 2, 0, containerSize.z / 2);

            const correctedMin = new THREE.Vector3(pose.min.x, pose.min.y, pose.min.z).sub(offset);
            const correctedMax = new THREE.Vector3(pose.max.x, pose.max.y, pose.max.z).sub(offset);
            
            const targetPosition = new THREE.Vector3().addVectors(correctedMin, correctedMax).multiplyScalar(0.5);
            const targetQuaternion = new THREE.Quaternion(); // Assuming no rotation from backend for now.

            // --- Update Visibility and Material ---
            mesh.visible = true;
            if (mesh.material) {
                mesh.material.transparent = false;
                mesh.material.opacity = 1;
            }

            // --- ATOMIC MESH AND PHYSICS UPDATE ---
            // Update the visual mesh first
            mesh.position.copy(targetPosition);
            mesh.quaternion.copy(targetQuaternion);
            mesh.updateMatrixWorld(true);

            // Now, update the physics body and lock it in one go
            if (body) {
                body.type = CANNON.Body.STATIC; // 1. Set as STATIC
                body.mass = 0;                  // 2. Mass of a static body is 0
                body.updateMassProperties();      // 3. Apply mass change

                body.position.copy(targetPosition);   // 4. Set final position
                body.quaternion.copy(targetQuaternion); // 5. Set final rotation
                
                body.velocity.set(0, 0, 0);       // 6. Nullify any residual forces
                body.angularVelocity.set(0, 0, 0);

                body.sleep(); // 7. Force the body to sleep, freezing it in place
            }
        });

        console.log("✅ All packed objects have been positioned and set to STATIC.");

        // --- Final UI Update ---
        let utilizationForDisplay = utilization;
        if (utilization > 0 && utilization <= 1) {
            utilizationForDisplay = utilization * 100;
        }
        const utilizationText = formatMetric(utilizationForDisplay, '%');
        const executionTimeText = formatMetric(executionTime, 's');
        
        forceUpdateDOM(utilizationText, executionTimeText);

        if (typeof updateProgressDisplay === 'function') {
            updateProgressDisplay({
                status: 'completed',
                progress: 100,
                utilization: utilizationText,
                execution_time: executionTimeText
            });
        }

    } catch (error) {
        console.error("❌ An error occurred during processPackedObjects:", error);
        if (typeof updateProgressDisplay === 'function') {
            updateProgressDisplay({
                status: 'failed',
                progress: 0,
                text: error.message
            });
        }
    } finally {
        isProcessing = false;
    }
}
