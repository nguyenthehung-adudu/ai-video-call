import { TranscriptionResult, TranscriptionProcessorOptions, TranscriptionCallbacks } from "./config";

export class TranscriptionProcessor {
  private options: TranscriptionProcessorOptions;
  private userId: string;
  private userName: string;
  private callbacks: TranscriptionCallbacks | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private headerChunk: Blob | null = null;   // Chunk đầu (chứa EBML header)
  private clusters: Blob[] = [];              // Các chunk sau (chỉ clusters)
  private stream: MediaStream | null = null;
  private isRecording: boolean = false;
  private isProcessing: boolean = false;
  private lastText: string = '';
  private lastHash: number = 0;
  private consecutiveEmpty: number = 0;

  constructor(
    options: TranscriptionProcessorOptions,
    userId: string,
    userName: string
  ) {
    this.options = options;
    this.userId = userId;
    this.userName = userName;
  }

  setCallbacks(
    onTranscript: (result: TranscriptionResult) => void,
    onError: (error: string) => void,
    onStateChange: (state: string) => void
  ): void {
    this.callbacks = { onTranscript, onError, onStateChange };
  }

  start(stream?: MediaStream): void {
    if (this.isRecording) {
      console.log("[Processor] Already recording");
      return;
    }

    this.stream = stream || null;
    if (!this.stream) {
      console.warn("[Processor] No audio stream");
      this.callbacks?.onError("Không có audio stream");
      return;
    }

    this.isRecording = true;
    this.isProcessing = false;
    this.headerChunk = null;  // Reset header (first chunk)
    this.clusters = [];       // Reset clusters (rest of chunks)
    this.lastText = '';
    this.lastHash = 0;
    this.consecutiveEmpty = 0;

    console.log("[Processor] Starting...");
    this.callbacks?.onStateChange("recording");

    try {
      // FIX: Improved MediaRecorder config for stable WebM
      // codecs=opus ensures valid audio encoding
      // 128kbps provides good quality without excessive size
      const mimeType = 'audio/webm;codecs=opus';

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`[Processor] Received chunk: ${event.data.size} bytes`);

          // FIX: First chunk contains EBML header, store separately
          if (this.headerChunk === null) {
            this.headerChunk = event.data;
            console.log("[Processor] Stored header chunk");
          } else {
            // Subsequent chunks are clusters (no header)
            this.clusters.push(event.data);
            console.log("[Processor] Stored cluster chunk, total clusters:", this.clusters.length);
          }
        }
      };

      this.mediaRecorder.onerror = (error) => {
        console.error("[Processor] Recorder error:", error);
        this.callbacks?.onError("Recording error");
      };

      // FIX: Timeslice 1000ms (1s chunks)
      this.mediaRecorder.start(1000);

      // FIX: Process every 2500ms (more stable, wait for multiple chunks)
      const processInterval = setInterval(() => {
        if (!this.isRecording) {
          clearInterval(processInterval);
          return;
        }
        this.processBufferedChunks();
      }, 2500);

      console.log("[Processor] Started with timeslice 1000ms, process interval 2500ms");

    } catch (error) {
      console.error("[Processor] Start failed:", error);
      this.callbacks?.onError("Không thể bắt đầu ghi âm");
      this.isRecording = false;
    }
  }

  /**
   * FIX: Process buffered chunks with proper WebM structure
   * First chunk = EBML header + first cluster
   * Subsequent chunks = cluster data only (no header)
   * Merge: headerChunk + all clusters → valid single WebM
   */
  private async processBufferedChunks(): Promise<void> {
    if (!this.isRecording) return;
    if (this.isProcessing) return;

    // FIX: Need header + at least 1 cluster for valid audio
    if (!this.headerChunk || this.clusters.length < 1) {
      console.log(`[Processor] Waiting: header=${!!this.headerChunk}, clusters=${this.clusters.length}`);
      return;
    }

    this.isProcessing = true;

    try {
      // FIX: Debug - show structure
      console.log("[Processor] Header chunk size:", this.headerChunk.size);
      console.log("[Processor] Cluster count:", this.clusters.length);

      // FIX: Build proper WebM: header + all clusters
      const allParts = [this.headerChunk, ...this.clusters];
      const mergedBlob = new Blob(allParts, { type: 'audio/webm' });
      const totalSize = mergedBlob.size;

      console.log("[Processor] Merged blob size:", totalSize, "bytes");

      // Clear buffer after merge
      this.headerChunk = null;
      this.clusters = [];

      const result = await this.sendToWhisperAPI(mergedBlob);

      if (result && result.text && result.is_valid) {
        const text = result.text.trim();

        if (text.length < 2) {
          this.isProcessing = false;
          return;
        }

        const hash = this.simpleHash(text);
        if (hash === this.lastHash) {
          console.log("[Processor] Duplicate hash");
          this.isProcessing = false;
          return;
        }

        if (this.lastText) {
          if (text.startsWith(this.lastText) || this.lastText.startsWith(text)) {
            const ratio = Math.min(text.length, this.lastText.length) / Math.max(text.length, this.lastText.length);
            if (ratio > 0.7) {
              console.log("[Processor] Too similar, skipping");
              this.isProcessing = false;
              return;
            }
          }
        }

        this.lastText = text;
        this.lastHash = hash;
        this.consecutiveEmpty = 0;

        console.log("[Processor] ✓", text);

        this.callbacks?.onTranscript({
          final_display: text,
          is_valid: true,
          confidence: result.confidence || 0.85,
          reason: result.reason,
        });

      } else {
        this.consecutiveEmpty++;
        console.log("[Processor] Rejected:", result?.reason || 'empty');
      }

    } catch (error) {
      console.error("[Processor] Error:", error);
      this.callbacks?.onError("API error");
    } finally {
      this.isProcessing = false;
    }
  }

  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 50); i++) {
      hash = (hash * 31 + text.charCodeAt(i)) & 0xFFFFFF;
    }
    return hash;
  }

  private async sendToWhisperAPI(audioBlob: Blob): Promise<{
    text: string;
    is_valid: boolean;
    reason?: string;
    confidence?: number;
  }> {
    // Debug: Check blob validity
    console.log(`[Processor] 🎤 Audio blob details: size=${audioBlob.size} bytes, type="${audioBlob.type}", constructor=${audioBlob.constructor.name}`);

    if (audioBlob.size === 0) {
      console.error('[Processor] ❌ Empty audio blob!');
      throw new Error('Empty audio blob');
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('userId', this.userId);
    formData.append('userName', this.userName);

    // Debug: Verify formData
    const fileEntry = formData.get('file');
    console.log(`[Processor] FormData file entry:`, fileEntry ? 'present' : 'MISSING');
    if (fileEntry instanceof File) {
      console.log(`[Processor] File in FormData: name=${fileEntry.name}, size=${fileEntry.size}, type=${fileEntry.type}`);
    }

    console.log(`[Processor] Sending audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type || 'unknown'}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('/api/whisper', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      console.log(`[Processor] API response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        let errorBody = '';
        try {
          const errData = await response.json();
          errorBody = JSON.stringify(errData);
        } catch (e) {
          errorBody = await response.text();
        }
        console.error('[Processor] API error response:', errorBody.substring(0, 300));
        throw new Error(`HTTP ${response.status}: ${errorBody.substring(0, 100)}`);
      }

      const data = await response.json();
      console.log('[Processor] API result:', data.is_valid ? '✅' : '❌', data.reason || 'accepted', '| text:', data.text.substring(0, 50));

      return {
        text: data.text || '',
        is_valid: data.is_valid,
        reason: data.reason,
        confidence: data.confidence,
      };

    } catch (error: any) {
      clearTimeout(timeout);
      console.error('[Processor] Fetch error:', error.message, error.name);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout after 30s');
      }
      throw error;
    }
  }

  stop(): void {
    if (!this.isRecording) return;

    console.log("[Processor] Stopping...");
    this.isRecording = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        // Stop will trigger ondataavailable with final chunk
        this.mediaRecorder.stop();
      } catch (e) {}
      this.mediaRecorder = null;
    }

    // FIX: Process remaining on stop (header + clusters)
    if (this.headerChunk || this.clusters.length > 0) {
      console.log(`[Processor] Processing final: header=${!!this.headerChunk}, clusters=${this.clusters.length}`);

      if (this.headerChunk && this.clusters.length >= 1) {
        // Have header + clusters → merge
        console.log("[Processor] Merging header + clusters on stop");
        const allParts = [this.headerChunk, ...this.clusters];
        const mergedBlob = new Blob(allParts, { type: 'audio/webm' });
        this.headerChunk = null;
        this.clusters = [];
        this.sendToWhisperAPI(mergedBlob).catch(console.error);

      } else if (this.headerChunk && this.headerChunk.size > 30000) {
        // Only header, but large enough
        console.log("[Processor] Sending header-only chunk");
        this.sendToWhisperAPI(this.headerChunk).catch(console.error);
        this.headerChunk = null;
      } else {
        // Too small, skip
        console.log("[Processor] Final audio too small, skipping");
        this.headerChunk = null;
        this.clusters = [];
      }
    }

    this.callbacks?.onStateChange("idle");
    console.log("[Processor] Stopped");
  }
}
