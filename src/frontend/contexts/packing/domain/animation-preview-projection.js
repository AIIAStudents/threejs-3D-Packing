import {
  buildDimensionText,
  buildProgressViewState
} from './packing-view-state.js';

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric));
}

export function buildAnimationPreviewState({
  packingData = null,
  currentStep = 0,
  totalSteps = 0,
  currentItem = null,
  isPlaying = false
} = {}) {
  const normalizedTotalSteps = Number(totalSteps) || 0;
  const normalizedCurrentStep = Math.max(0, Math.min(Number(currentStep) || 0, normalizedTotalSteps));
  const progress = buildProgressViewState({
    current: normalizedCurrentStep,
    total: normalizedTotalSteps,
    fractionDigits: 0
  });

  const baseUtilization = Number(packingData?.utilization) || 0;
  const utilizationPercent = normalizedTotalSteps > 0
    ? (normalizedCurrentStep / normalizedTotalSteps) * baseUtilization
    : 0;

  const itemName = currentItem?.item_name || currentItem?.item_id || currentItem?.id || null;
  const currentItemText = itemName
    ? `${itemName} (${currentItem?.pose ? buildPoseDimensionText(currentItem) : buildDimensionText(currentItem, { fallback: '-' })})`
    : '-';

  return {
    progressPercent: progress.progressPercent,
    progressText: progress.progressText,
    currentStepText: progress.stepText,
    utilizationText: `${Number.isFinite(utilizationPercent) ? utilizationPercent.toFixed(1) : '0.0'}%`,
    currentItemText,
    canGoPrevious: normalizedCurrentStep > 0,
    canGoNext: normalizedCurrentStep < normalizedTotalSteps,
    playButtonLabel: isPlaying ? 'Pause' : 'Play',
    playButtonTitle: isPlaying ? 'Pause animation' : 'Play animation'
  };
}

export function buildSeekPreviewState(percent, totalSteps = 0) {
  const clampedPercent = clampPercent(percent);
  const normalizedTotalSteps = Number(totalSteps) || 0;
  const targetStep = Math.floor(normalizedTotalSteps * clampedPercent);
  const progress = buildProgressViewState({
    current: targetStep,
    total: normalizedTotalSteps,
    fractionDigits: 0
  });

  return {
    percent: clampedPercent,
    targetStep,
    progressPercent: progress.progressPercent,
    progressText: progress.progressText,
    currentStepText: progress.stepText
  };
}

function buildPoseDimensionText(item = {}) {
  return [
    Math.round(item.pose.max.x - item.pose.min.x),
    Math.round(item.pose.max.y - item.pose.min.y),
    Math.round(item.pose.max.z - item.pose.min.z)
  ].join(' x ');
}
