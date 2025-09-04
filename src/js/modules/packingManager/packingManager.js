import { executePacking } from './executePacking.js';
import { applyPackingResult, deepSearchPackedObjects, manualParseResult, getAllKeys, getValueByPath, createFallbackPackedObjects } from './parsePackingResult.js';
import { processPackedObjects } from './processPackedObjects.js';
import { simulatePacking, simulatePackingAlgorithm, calculateVolumeUtilization } from './simulatePacking.js';
import { forceUpdateDOM, observeDOMChanges, forceRepaint, forceUpdateScene, startContinuousRendering } from './updateDOM.js';
import { updateProgressDisplay, formatMetric } from './updateProgressDisplay.js';
import { requestBinPacking, pollJobUntilComplete } from '../../utils/binPackingAPI.js';

export class PackingManager {
    constructor(groupManager) {
      this.groupManager = groupManager;
      this.objectManager = groupManager.objectManager; // Get objectManager from groupManager
      this.physicsEnabled = true;
      // Bind methods to this instance
      this.executePacking = this._executePacking.bind(this);
      this.simulatePacking = this._simulatePacking.bind(this);
      this.applyPackingResult = this._applyPackingResult.bind(this);
      this.processPackedObjects = this._processPackedObjects.bind(this);
      this.updateProgressDisplay = this._updateProgressDisplay.bind(this);
      this.cancelPacking = this._cancelPacking.bind(this);
      this.deepSearchPackedObjects = this._deepSearchPackedObjects.bind(this);
      this.manualParseResult = this._manualParseResult.bind(this);
      this.getAllKeys = this._getAllKeys.bind(this);
      this.getValueByPath = this._getValueByPath.bind(this);
      this.createFallbackPackedObjects = this._createFallbackPackedObjects.bind(this);
      this.forceUpdateDOM = this._forceUpdateDOM.bind(this);
      this.observeDOMChanges = this._observeDOMChanges.bind(this);
      this.forceRepaint = this._forceRepaint.bind(this);
      this.forceUpdateScene = this._forceUpdateScene.bind(this);
      this.startContinuousRendering = this._startContinuousRendering.bind(this);
      this.formatMetric = formatMetric;
      this.calculateVolumeUtilization = calculateVolumeUtilization;
    }

    async _executePacking() {
        return executePacking.call(this);
    }

    _simulatePacking(objects, containerSize) {
        return simulatePacking.call(this, objects, containerSize);
    }

    _applyPackingResult(result) {
        return applyPackingResult.call(this, result);
    }

    _processPackedObjects(packedObjects, utilization, executionTime) {
        return processPackedObjects.call(this, packedObjects, utilization, executionTime, this.forceUpdateScene);
    }

    _updateProgressDisplay(progress) {
        return updateProgressDisplay.call(this, progress);
    }

    _cancelPacking() {
        document.getElementById('packing-panel').style.display = 'none';
        // 這裡可以添加取消打包的邏輯
    }

    _deepSearchPackedObjects(obj, maxDepth = 3, currentDepth = 0) {
        return deepSearchPackedObjects.call(this, obj, maxDepth, currentDepth);
    }

    _manualParseResult(result) {
        return manualParseResult.call(this, result);
    }

    _getAllKeys(obj, prefix = '') {
        return getAllKeys.call(this, obj, prefix);
    }

    _getValueByPath(obj, path) {
        return getValueByPath.call(this, obj, path);
    }

    _createFallbackPackedObjects(objects) {
        return createFallbackPackedObjects.call(this, objects);
    }

    _forceUpdateDOM(utilizationText, executionTimeText) {
        return forceUpdateDOM.call(this, utilizationText, executionTimeText);
    }
    
    _observeDOMChanges() {
        return observeDOMChanges.call(this);
    }
    
    _forceRepaint() {
        return forceRepaint.call(this);
    }
    
    _forceUpdateScene() {
        return forceUpdateScene.call(this);
    }
    
    _startContinuousRendering() {
        return startContinuousRendering.call(this);
    }
    
    _formatMetric(value) {
        return formatMetric.call(this, value);
    }

    _calculateVolumeUtilization(packedObjects, containerSize) {
        return calculateVolumeUtilization.call(this, packedObjects, containerSize);
    }
}