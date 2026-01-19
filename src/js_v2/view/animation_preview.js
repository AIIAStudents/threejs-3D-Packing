import { NewAnimationViewer as AnimationViewer } from './new_animation_viewer.js';
import { throttle } from '../utils/performance.js';

/**
 * Animation Preview Page Controller
 * Manages the 3D packing animation playback
 */
class AnimationPreview {
  constructor() {
    this.API_BASE = 'http://127.0.0.1:8888/api';
    this.viewer = null;
    this.packingData = null;
    this.currentSpeed = 1.0;

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

    this.isDragging = false;
    this.init();
  }

  async init() {
    console.log('[AnimationPreview] Initializing...');

    // Initialize 3D viewer
    this.initViewer();

    // Setup event listeners
    this.setupEventListeners();

    // Load packing data
    await this.loadPackingData();

    console.log('[AnimationPreview] Initialization complete');
  }

  initViewer() {
    if (!this.elements.canvas) {
      console.error('Canvas container not found');
      return;
    }

    // Wait for canvas to have dimensions
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          if (!this.viewer) {
            this.createViewer();
          }
          // Once initialized, we can likely stop observing if we only needed it for init, 
          // but keeping it for resize handling is handled by window resize mostly.
          // However, if the container itself resizes (dialog/split), this is good.
        }
      }
    });

    resizeObserver.observe(this.elements.canvas);
  }

  createViewer() {
    try {
      this.viewer = new AnimationViewer(this.elements.canvas);
      this.viewer.init();

      // Listen to animation events
      this.viewer.on('stepChange', (data) => this.onStepChange(data));
      this.viewer.on('animationComplete', () => this.onAnimationComplete());

      // If data was already loaded, load it now
      if (this.packingData) {
        this.viewer.loadAnimation(this.packingData);
        this.updateUI();
      }

      console.log('✓ AnimationViewer initialized');
    } catch (error) {
      console.error('Failed to initialize viewer:', error);
    }
  }

  setupEventListeners() {
    // Playback controls
    this.elements.btnReset?.addEventListener('click', () => this.reset());
    this.elements.btnPrev?.addEventListener('click', () => this.previousStep());
    this.elements.btnPlay?.addEventListener('click', () => this.togglePlay());
    this.elements.btnNext?.addEventListener('click', () => this.nextStep());

    // Speed controls
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const speed = parseFloat(e.target.dataset.speed);
        this.setSpeed(speed);

        // Update active state
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    // Progress bar Drag & Drop
    const progressBar = this.elements.progressBar;
    if (progressBar) {
      // Use throttle for the Move event
      let rafId = null;
      let pendingPercent = null;
      // Throttle UI updates to reduce DOM manipulation frequency
      let lastUIUpdate = 0;
      const updateUIInstantly = (percent) => {
        if (!this.viewer) return;

        // Throttle UI updates to ~60fps (16ms)
        const now = performance.now();
        if (now - lastUIUpdate < 16) return;
        lastUIUpdate = now;

        const targetStep = Math.floor(this.viewer.totalSteps * percent);
        const progress = this.viewer.totalSteps > 0 ? (targetStep / this.viewer.totalSteps) * 100 : 0;

        if (this.elements.progressFill) this.elements.progressFill.style.width = `${progress}%`;
        if (this.elements.progressText) this.elements.progressText.textContent = `${Math.round(progress)}%`;
        if (this.elements.currentStep) this.elements.currentStep.textContent = `${targetStep} / ${this.viewer.totalSteps}`;
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

      const onDragMove = (e) => {
        if (!this.isDragging) return;
        const rect = progressBar.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));

        updateUIInstantly(percent);
        request3DUpdate(percent);
      };
      const onDragStart = (e) => {
        this.isDragging = true;
        if (this.viewer) this.viewer.isDragging = true; // Suppress events during drag
        this.viewer?.setInteractionState(true); // Low quality mode

        // Immediate update on click
        const rect = progressBar.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));

        updateUIInstantly(percent);
        this.seekToPercent(percent);

        // Bind global listeners
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
      };

      const onDragEnd = () => {
        if (!this.isDragging) return;
        this.isDragging = false;

        // Cancel any pending RAF
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        // Re-enable events and emit final stepChange
        if (this.viewer) {
          this.viewer.isDragging = false;
          this.viewer.emit('stepChange', {
            step: this.viewer.currentStep,
            total: this.viewer.totalSteps
          });
        }
        this.viewer?.setInteractionState(false); // Restore quality

        // Unbind global listeners
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
      };

      progressBar.addEventListener('mousedown', onDragStart);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'ArrowLeft') {
        this.previousStep();
      } else if (e.code === 'ArrowRight') {
        this.nextStep();
      } else if (e.code === 'KeyR') {
        this.reset();
      }
    });
  }

  async loadPackingData() {
    try {
      console.log('Loading packing data...');
      const response = await fetch(`${this.API_BASE}/sequence/latest-result`);

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Packing data loaded:', data);

      // Process data for animation
      this.processPackingData(data);

      // Initialize animation with data
      if (this.viewer && this.packingData) {
        this.viewer.loadAnimation(this.packingData);
        this.updateUI();
      }

    } catch (error) {
      console.error('Failed to load packing data:', error);
      this.showError('無法載入打包資料');
    }
  }

  processPackingData(data) {
    // Collect all packed items from all spaces
    let allItems = [];
    const spaces = data.spaces || [];

    spaces.forEach(space => {
      if (space.result && space.result.items) {
        const zoneOffset = {
          x: 0,
          y: 0
        };

        // Find zone offset
        const zone = data.zones?.find(z => z.zone_id === space.zone_id);
        if (zone) {
          zoneOffset.x = zone.x || 0;
          zoneOffset.y = zone.y || 0;
        }

        const spaceItems = space.result.items
          .filter(item => item.is_packed)
          .map(item => ({
            ...item,
            zoneOffset: zoneOffset
          }));

        allItems = allItems.concat(spaceItems);
      }
    });

    this.packingData = {
      container: data.container || {},
      zones: data.zones || [],
      items: allItems,
      totalItems: allItems.length,
      utilization: data.spaces?.[0]?.result?.volume_utilization || 0
    };

    console.log('Processed packing data:', this.packingData);
    // DEBUG: Verify container shape is preserved
    console.log('[AnimationPreview] Processed container.shape:', this.packingData.container?.shape);
  }

  // Playback controls
  togglePlay() {
    if (!this.viewer) return;

    if (this.viewer.isPlaying) {
      this.viewer.pause();
      this.elements.btnPlay.innerHTML = '▶';
      this.elements.btnPlay.title = '播放';
    } else {
      this.viewer.play();
      this.elements.btnPlay.innerHTML = '❚❚';
      this.elements.btnPlay.title = '暫停';
    }
  }

  reset() {
    if (!this.viewer) return;
    this.viewer.reset();
    this.elements.btnPlay.innerHTML = '▶';
    this.updateUI();
  }

  nextStep() {
    if (!this.viewer) return;
    this.viewer.nextStep();
  }

  previousStep() {
    if (!this.viewer) return;
    this.viewer.previousStep();
  }

  setSpeed(speed) {
    this.currentSpeed = speed;
    if (this.viewer) {
      this.viewer.setSpeed(speed);
    }
  }

  seekToPercent(percent) {
    if (!this.viewer) return;
    this.viewer.seekToPercent(percent);
  }

  // Event handlers
  onStepChange(data) {
    this.updateUI();
  }

  onAnimationComplete() {
    this.elements.btnPlay.innerHTML = '▶';
    console.log('Animation complete!');
  }

  // UI updates
  updateUI() {
    if (!this.viewer) return;

    const current = this.viewer.currentStep;
    const total = this.viewer.totalSteps;
    const progress = total > 0 ? (current / total) * 100 : 0;

    // Update progress
    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${progress}%`;
    }
    if (this.elements.progressText) {
      this.elements.progressText.textContent = `${Math.round(progress)}%`;
    }

    // Update step counter
    if (this.elements.currentStep) {
      this.elements.currentStep.textContent = `${current} / ${total}`;
    }

    // Update current item info
    if (this.elements.currentItem) {
      const item = this.viewer.getCurrentItem();
      if (item) {
        const dims = item.pose ?
          `${Math.round(item.pose.max.x - item.pose.min.x)}×${Math.round(item.pose.max.y - item.pose.min.y)}×${Math.round(item.pose.max.z - item.pose.min.z)}` :
          '-';
        const itemName = item.item_name || item.item_id || item.id || 'Unknown';
        this.elements.currentItem.textContent = `${itemName} (${dims})`;
      } else {
        this.elements.currentItem.textContent = '-';
      }
    }

    // Update utilization
    if (this.elements.utilization && this.packingData) {
      const util = ((current / total) * this.packingData.utilization).toFixed(1);
      this.elements.utilization.textContent = `${util}%`;
    }

    // Update button states
    if (this.elements.btnPrev) {
      this.elements.btnPrev.disabled = current === 0;
    }
    if (this.elements.btnNext) {
      this.elements.btnNext.disabled = current >= total;
    }
  }

  showError(message) {
    if (this.elements.canvas) {
      this.elements.canvas.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #d32f2f;">
          <div style="text-align: center;">
            <h3>⚠️ 錯誤</h3>
            <p>${message}</p>
          </div>
        </div>
      `;
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AnimationPreview());
} else {
  new AnimationPreview();
}

export default AnimationPreview;
