import { AnimationViewer } from './animation_viewer.js?v=2';
import { animationPreviewService } from '../../frontend/contexts/packing/application/animation-preview-service.js';

class AnimationPreview {
  static init() {
    const canvas = document.getElementById('animation-canvas');
    if (!canvas) {
      return null;
    }

    return new AnimationPreview();
  }

  constructor() {
    this.viewer = null;
    this.packingData = null;
    this.currentSpeed = 1.0;
    this.previewState = null;
    this.isDragging = false;

    this.elements = {
      canvas: document.getElementById('animation-canvas'),
      progressBar: document.getElementById('progress-bar'),
      progressFill: document.getElementById('progress-fill'),
      progressText: document.getElementById('progress-text'),
      btnReset: document.getElementById('btn-reset'),
      btnPrev: document.getElementById('btn-prev'),
      btnPlay: document.getElementById('btn-play'),
      btnNext: document.getElementById('btn-next'),
      currentStep: document.getElementById('current-step'),
      currentItem: document.getElementById('current-item'),
      utilization: document.getElementById('utilization')
    };

    this.init();
  }

  async init() {
    if (!this.elements.canvas) {
      return;
    }

    this.initViewer();
    this.setupEventListeners();
    await this.loadPreviewState();
  }

  initViewer() {
    if (!this.elements.canvas) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0 && !this.viewer) {
          this.createViewer();
        }
      }
    });

    resizeObserver.observe(this.elements.canvas);
  }

  createViewer() {
    try {
      this.viewer = new AnimationViewer(this.elements.canvas);
      this.viewer.init();
      this.viewer.on('stepChange', () => this.onStepChange());
      this.viewer.on('animationComplete', () => this.onAnimationComplete());

      if (this.packingData) {
        this.viewer.loadAnimation(this.packingData);
        this.updateUI();
      }
    } catch (error) {
      console.error('Failed to initialize viewer:', error);
      this.showError(`Failed to initialize animation viewer: ${error.message}`);
    }
  }

  setupEventListeners() {
    this.elements.btnReset?.addEventListener('click', () => this.reset());
    this.elements.btnPrev?.addEventListener('click', () => this.previousStep());
    this.elements.btnPlay?.addEventListener('click', () => this.togglePlay());
    this.elements.btnNext?.addEventListener('click', () => this.nextStep());

    document.querySelectorAll('.speed-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        const speed = parseFloat(event.target.dataset.speed);
        this.setSpeed(speed);
        document.querySelectorAll('.speed-btn').forEach((entry) => entry.classList.remove('active'));
        event.target.classList.add('active');
      });
    });

    this.setupProgressBarInteractions();

    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        this.togglePlay();
      } else if (event.code === 'ArrowLeft') {
        this.previousStep();
      } else if (event.code === 'ArrowRight') {
        this.nextStep();
      } else if (event.code === 'KeyR') {
        this.reset();
      }
    });
  }

  setupProgressBarInteractions() {
    const progressBar = this.elements.progressBar;
    if (!progressBar) {
      return;
    }

    let rafId = null;
    let pendingPercent = null;
    let lastUIUpdate = 0;

    const updatePreviewInstantly = (percent) => {
      if (!this.viewer) {
        return;
      }

      const now = performance.now();
      if (now - lastUIUpdate < 16) {
        return;
      }
      lastUIUpdate = now;

      this.renderSeekPreview(percent);
    };

    const request3DUpdate = (percent) => {
      pendingPercent = percent;
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          if (pendingPercent !== null) {
            this.seekToPercent(pendingPercent);
            pendingPercent = null;
          }
          rafId = null;
        });
      }
    };

    const onDragMove = (event) => {
      if (!this.isDragging) {
        return;
      }

      const percent = this.resolveProgressPercent(event, progressBar);
      updatePreviewInstantly(percent);
      request3DUpdate(percent);
    };

    const onDragEnd = () => {
      if (!this.isDragging) {
        return;
      }

      this.isDragging = false;

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (this.viewer) {
        this.viewer.isDragging = false;
        this.viewer.emit('stepChange', {
          step: this.viewer.currentStep,
          total: this.viewer.totalSteps
        });
      }

      this.viewer?.setInteractionState(false);
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
    };

    const onDragStart = (event) => {
      this.isDragging = true;
      if (this.viewer) {
        this.viewer.isDragging = true;
      }
      this.viewer?.setInteractionState(true);

      const percent = this.resolveProgressPercent(event, progressBar);
      updatePreviewInstantly(percent);
      this.seekToPercent(percent);

      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
    };

    progressBar.addEventListener('mousedown', onDragStart);
  }

  resolveProgressPercent(event, progressBar) {
    const rect = progressBar.getBoundingClientRect();
    const percent = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    return Math.max(0, Math.min(1, percent));
  }

  async loadPreviewState() {
    try {
      const { packingData, previewState } = await animationPreviewService.loadPreviewState();
      this.packingData = packingData;
      this.previewState = previewState;

      if (this.viewer && this.packingData) {
        this.viewer.loadAnimation(this.packingData);
      }

      this.renderPreviewState();
      this.updateUI();
    } catch (error) {
      console.error('Failed to load packing data:', error);
      this.showError(`Failed to load animation preview: ${error.message}`);
    }
  }

  togglePlay() {
    if (!this.viewer) {
      return;
    }

    if (this.viewer.isPlaying) {
      this.viewer.pause();
    } else {
      this.viewer.play();
    }

    this.updateUI();
  }

  reset() {
    if (!this.viewer) {
      return;
    }
    this.viewer.reset();
    this.updateUI();
  }

  nextStep() {
    if (!this.viewer) {
      return;
    }
    this.viewer.nextStep();
    this.updateUI();
  }

  previousStep() {
    if (!this.viewer) {
      return;
    }
    this.viewer.previousStep();
    this.updateUI();
  }

  setSpeed(speed) {
    this.currentSpeed = speed;
    if (this.viewer) {
      this.viewer.setSpeed(speed);
    }
  }

  seekToPercent(percent) {
    if (!this.viewer) {
      return;
    }
    this.viewer.seekToPercent(percent);
  }

  getViewerSnapshot() {
    return {
      currentStep: this.viewer?.currentStep || 0,
      totalSteps: this.viewer?.totalSteps || 0,
      currentItem: this.viewer?.getCurrentItem?.() || null,
      isPlaying: Boolean(this.viewer?.isPlaying)
    };
  }

  renderSeekPreview(percent) {
    const seekState = animationPreviewService.buildSeekState(percent, this.viewer?.totalSteps || 0);

    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${seekState.progressPercent}%`;
    }
    if (this.elements.progressText) {
      this.elements.progressText.textContent = seekState.progressText;
    }
    if (this.elements.currentStep) {
      this.elements.currentStep.textContent = seekState.currentStepText;
    }
  }

  updateUI() {
    this.previewState = animationPreviewService.buildPreviewState({
      packingData: this.packingData,
      ...this.getViewerSnapshot()
    });
    this.renderPreviewState();
  }

  renderPreviewState() {
    const state = this.previewState;
    if (!state) {
      return;
    }

    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${state.progressPercent}%`;
    }
    if (this.elements.progressText) {
      this.elements.progressText.textContent = state.progressText;
    }
    if (this.elements.currentStep) {
      this.elements.currentStep.textContent = state.currentStepText;
    }
    if (this.elements.utilization) {
      this.elements.utilization.textContent = state.utilizationText;
    }
    if (this.elements.currentItem) {
      this.elements.currentItem.textContent = state.currentItemText;
    }
    if (this.elements.btnPrev) {
      this.elements.btnPrev.disabled = !state.canGoPrevious;
    }
    if (this.elements.btnNext) {
      this.elements.btnNext.disabled = !state.canGoNext;
    }
    if (this.elements.btnPlay) {
      this.elements.btnPlay.innerHTML = state.playButtonLabel;
      this.elements.btnPlay.title = state.playButtonTitle;
    }
  }

  onStepChange() {
    this.updateUI();
  }

  onAnimationComplete() {
    this.updateUI();
  }

  showError(message) {
    if (!this.elements.canvas) {
      return;
    }

    this.elements.canvas.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #d32f2f;">
        <div style="text-align: center;">
          <h3>Preview Error</h3>
          <p>${message}</p>
        </div>
      </div>
    `;
  }
}

export default AnimationPreview;
