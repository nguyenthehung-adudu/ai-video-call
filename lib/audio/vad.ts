/**
 * Voice Activity Detection (VAD) using Web Audio API
 *
 * Features:
 * - Real-time volume analysis
 * - Adaptive noise floor
 * - Speech detection with hysteresis
 * - Controls MediaRecorder start/stop
 */

export interface VADConfig {
  volumeThreshold: number;          // 0-1, default 0.035
  minSpeechDurationMs: number;      // Minimum speech duration (ms)
  silenceTimeoutMs: number;         // Silence timeout before stopping (ms)
  useAdaptiveThreshold: boolean;    // Auto-adjust threshold
  noiseFloorWindowMs: number;        // Window for noise floor estimation
}

export interface VADState {
  isSpeaking: boolean;
  volume: number;
  noiseFloor: number;
  speechStartTime: number | null;
}

export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;

  private config: VADConfig;
  private state: VADState;
  private onSpeechStart?: () => void;
  private onSpeechEnd?: () => void;
  private onVolumeChange?: (volume: number) => void;

  private isInitialized: boolean = false;
  private animationFrameId: number | null = null;

  // Adaptive threshold state
  private recentVolumes: number[] = [];
  private recentVolumesMaxLength: number;

  constructor(config: Partial<VADConfig> = {}) {
    this.config = {
      volumeThreshold: config.volumeThreshold ?? 0.035,
      minSpeechDurationMs: config.minSpeechDurationMs ?? 300,
      silenceTimeoutMs: config.silenceTimeoutMs ?? 1200,
      useAdaptiveThreshold: config.useAdaptiveThreshold ?? true,
      noiseFloorWindowMs: config.noiseFloorWindowMs ?? 100,
    };

    this.recentVolumesMaxLength = 30; // ~1 second at 30fps

    this.state = {
      isSpeaking: false,
      volume: 0,
      noiseFloor: 0,
      speechStartTime: null,
    };
  }

  /**
   * Initialize VAD with audio stream
   */
  initialize(stream: MediaStream): boolean {
    if (this.isInitialized) {
      console.log("[VAD] Already initialized");
      return true;
    }

    try {
      // Create AudioContext
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect stream to analyser
      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      // Buffer for volume data
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      this.isInitialized = true;
      console.log("[VAD] Initialized successfully");
      return true;
    } catch (error) {
      console.error("[VAD] Initialization failed:", error);
      return false;
    }
  }

  /**
   * Start VAD analysis
   */
  start(): void {
    if (!this.isInitialized || !this.analyser) {
      console.warn("[VAD] Not initialized, cannot start");
      return;
    }

    this.analyze();
    console.log("[VAD] Started analysis");
  }

  /**
   * Stop VAD analysis
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Cleanup
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.dataArray = null;
    this.isInitialized = false;

    // Reset state
    this.state = {
      isSpeaking: false,
      volume: 0,
      noiseFloor: 0,
      speechStartTime: null,
    };
    this.recentVolumes = [];

    console.log("[VAD] Stopped and cleaned up");
  }

  /**
   * Main VAD loop - called via requestAnimationFrame
   */
  private analyze = (): void => {
    if (!this.analyser || !this.dataArray) {
      return;
    }

    // Get volume (RMS of frequency data)
    this.analyser.getByteFrequencyData(this.dataArray);

    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i] * this.dataArray[i];
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    const normalizedVolume = rms / 255; // Normalize to 0-1

    // Update recent volumes for adaptive threshold
    this.recentVolumes.push(normalizedVolume);
    if (this.recentVolumes.length > this.recentVolumesMaxLength) {
      this.recentVolumes.shift();
    }

    // Calculate noise floor (median of recent quiet volumes)
    const sorted = [...this.recentVolumes].sort((a, b) => a - b);
    const quietVolumes = sorted.slice(0, Math.floor(sorted.length * 0.3)); // Bottom 30%
    const noiseFloor = quietVolumes.length > 0
      ? quietVolumes[quietVolumes.length - 1]
      : 0;

    // Determine effective threshold
    const threshold = this.config.useAdaptiveThreshold
      ? Math.max(this.config.volumeThreshold, noiseFloor + 0.02) // noise floor + buffer
      : this.config.volumeThreshold;

    // Hysteresis: different thresholds for start/stop to prevent flickering
    const START_THRESHOLD = threshold * 1.3;  // Harder to start
    const STOP_THRESHOLD = threshold * 0.9;   // Easier to stop

    const now = Date.now();
    const wasSpeaking = this.state.isSpeaking;
    let isSpeaking = this.state.isSpeaking;

    // Speech detection with hysteresis
    if (!wasSpeaking && normalizedVolume > START_THRESHOLD) {
      // Start speaking
      isSpeaking = true;
      this.state.speechStartTime = now;
    } else if (wasSpeaking && normalizedVolume < STOP_THRESHOLD) {
      // Check silence timeout
      if (this.state.speechStartTime) {
        const silenceDuration = now - (this.state.speechStartTime + this.getSpeechDuration());
        if (silenceDuration > this.config.silenceTimeoutMs) {
          isSpeaking = false;
          this.state.speechStartTime = null;
        }
      }
    }

    // Update state
    this.state.volume = normalizedVolume;
    this.state.noiseFloor = noiseFloor;
    const speakingChanged = isSpeaking !== wasSpeaking;

    if (speakingChanged) {
      this.state.isSpeaking = isSpeaking;
      if (isSpeaking) {
        console.log(`[VAD] 🟢 Speech detected (volume: ${normalizedVolume.toFixed(4)})`);
        this.onSpeechStart?.();
      } else {
        console.log(`[VAD] 🔴 Speech ended (duration: ${this.getSpeechDuration()}ms)`);
        this.onSpeechEnd?.();
      }
    }

    // Notify volume change (for UI)
    this.onVolumeChange?.(normalizedVolume);

    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.analyze);
  };

  /**
   * Get current speech duration in ms
   */
  private getSpeechDuration(): number {
    if (!this.state.speechStartTime) return 0;
    return Date.now() - this.state.speechStartTime;
  }

  // ── Event Handlers ──────────────────────────────────────────────────────

  setOnSpeechStart(callback: () => void): void {
    this.onSpeechStart = callback;
  }

  setOnSpeechEnd(callback: () => void): void {
    this.onSpeechEnd = callback;
  }

  setOnVolumeChange(callback: (volume: number) => void): void {
    this.onVolumeChange = callback;
  }

  // ── Getters ─────────────────────────────────────────────────────────────

  getState(): VADState {
    return { ...this.state };
  }

  isCurrentlySpeaking(): boolean {
    return this.state.isSpeaking;
  }

  getVolume(): number {
    return this.state.volume;
  }

  getNoiseFloor(): number {
    return this.state.noiseFloor;
  }
}

/**
 * Factory function to create VAD with default config
 */
export function createVAD(config?: Partial<VADConfig>): VoiceActivityDetector {
  return new VoiceActivityDetector(config);
}
