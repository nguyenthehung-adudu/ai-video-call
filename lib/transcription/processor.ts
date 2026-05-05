import { TranscriptionResult, TranscriptionProcessorOptions, TranscriptionCallbacks } from "./config";

export class TranscriptionProcessor {
  private options: TranscriptionProcessorOptions;
  private userId: string;
  private userName: string;
  private callbacks: TranscriptionCallbacks | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private isRecording: boolean = false;
  private isStopping: boolean = false;
  private isFinalized: boolean = false;
  private isProcessing: boolean = false;
  private finalFlushDone: boolean = false;
  private lastText: string = '';
  private lastHash: number = 0;
  private consecutiveEmpty: number = 0;
  private stopPromiseResolver: (() => void) | null = null;

  // ── BUFFERING CONFIG ────────────────────────────────────────────────────
  private readonly CHUNK_DURATION_MS = 200;          // MediaRecorder timeslice
  private readonly MIN_SEND_INTERVAL_MS = 2000;      // Cooldown: 2s between requests
  private readonly MIN_AUDIO_SIZE_BYTES = 20 * 1024; // Minimum 20KB blob size
  private readonly SILENCE_BEFORE_SEND_MS = 1200;    // Silence >= 1.2s triggers send

  private lastSendTime: number = 0;                  // Throttle timestamp
  private silenceStartTime: number | null = null;    // Track when silence began
  private isCurrentlySpeaking: boolean = false;      // VAD state
  private onVADStateChange: ((isSpeaking: boolean) => void) | null = null;

  private recentTranscripts: Map<number, { text: string; count: number; lastSeen: number }> = new Map();
  private readonly STABILITY_WINDOW_MS = 1000;

  private translationCache: Map<string, string> = new Map();

  
  getIsRecording(): boolean {
    return this.isRecording;
  }

  
  setSpeakingState(isSpeaking: boolean): void {
    const wasSpeaking = this.isCurrentlySpeaking;
    this.isCurrentlySpeaking = isSpeaking;

    if (isSpeaking) {
      // 说话开始：清除静音计时器
      this.silenceStartTime = null;
    } else {
     
      if (this.silenceStartTime === null) {
        this.silenceStartTime = Date.now();
        this.clearChunksOnSilence();
      }
    }

    this.onVADStateChange?.(isSpeaking);
  }

  
  private clearChunksOnSilence(): void {
    if (this.chunks.length > 0) {
      console.log(`[Processor] 🗑️ Silence detected: cleared ${this.chunks.length} buffered chunks`);
      this.chunks = [];
    }
  }

  /**
   * 设置 VAD 状态变化回调
   */
  setOnVADStateChange(callback: (isSpeaking: boolean) => void): void {
    this.onVADStateChange = callback;
  }

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

    // Reset state
    this.isRecording = true;
    this.isStopping = false;
    this.isFinalized = false;
    this.isProcessing = false;
    this.finalFlushDone = false;
    this.chunks = [];
    this.lastText = '';
    this.lastHash = 0;
    this.consecutiveEmpty = 0;
    this.stopPromiseResolver = null;
    this.lastSendTime = 0;
    this.silenceStartTime = null;
    this.isCurrentlySpeaking = false;
    this.recentTranscripts.clear();

    console.log("[Processor] === START RECORDING ===");
    this.callbacks?.onStateChange("recording");

    try {
      const mimeType = 'audio/webm;codecs=opus';
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;

        if (this.isFinalized) {
          console.log("[Processor] ⚠️ Late chunk after finalization, ignoring");
          return;
        }

        console.log(`[Processor] 📦 Chunk received: ${event.data.size} bytes`);
        this.chunks.push(event.data);
        console.log(`[Processor] ✅ Stored chunk #${this.chunks.length}`);
      };

      this.mediaRecorder.onerror = (error) => {
        console.error("[Processor] ❌ Recorder error:", error);
        this.callbacks?.onError("Recording error");
      };

      // 200ms chunks for fine-grained VAD
      this.mediaRecorder.start(200);
      console.log("[Processor] Started: 200ms chunks");

      // BUFFER MONITOR: check every 150ms
      const bufferMonitorInterval = setInterval(() => {
        if (!this.isRecording) {
          clearInterval(bufferMonitorInterval);
          return;
        }
        this.evaluateBuffer().catch(console.error);
      }, 150);

      console.log("[Processor] Buffer monitor: 150ms interval");

    } catch (error) {
      console.error("[Processor] ❌ Start failed:", error);
      this.callbacks?.onError("Không thể bắt đầu ghi âm");
      this.isRecording = false;
    }
  }

  
  private async evaluateBuffer(): Promise<void> {
    // Skip if already processing (concurrency guard)
    if (this.isProcessing) {
      console.log("[Buffer] ⏳ Already processing, skipping evaluation");
      return;
    }

    // Skip if no new chunks
    if (this.chunks.length === 0) {
      return;
    }

    
    if (this.isCurrentlySpeaking) {
      console.log("[Buffer] ⏳ Still speaking, buffering...");
      return;
    }

    const now = Date.now();
    const silenceDuration = this.silenceStartTime ? now - this.silenceStartTime : 0;

    if (silenceDuration < this.SILENCE_BEFORE_SEND_MS) {
      console.log(`[Buffer] ⏳ Silence too short (${silenceDuration}ms < ${this.SILENCE_BEFORE_SEND_MS}ms)`);
      return;
    }

    // ── THROTTLE CHECK ────────────────────────────────────────────────────
    const timeSinceLastSend = now - this.lastSendTime;
    if (timeSinceLastSend < this.MIN_SEND_INTERVAL_MS) {
      const remaining = this.MIN_SEND_INTERVAL_MS - timeSinceLastSend;
      console.log(`[Buffer] ⏱️ Cooldown active: ${remaining}ms remaining`);
      return;
    }

    // ── CHECK MINIMUM AUDIO SIZE ───────────────────────────────────────────
    // 估算 blob 大小：每 chunk 约 200ms，~2KB/chunk @ 128kbps
    // 更准确：直接构建 blob 检查
    const estimatedBlobSize = this.chunks.reduce((acc, chunk) => acc + chunk.size, 0);

    if (estimatedBlobSize < this.MIN_AUDIO_SIZE_BYTES) {
      console.log(`[Buffer] ⚠️ Audio too small (${estimatedBlobSize} bytes < ${this.MIN_AUDIO_SIZE_BYTES} bytes), skipping and clearing`);
      // 太小，清除并跳过
      this.chunks = [];
      this.silenceStartTime = null;
      return;
    }

    // ── SEND ────────────────────────────────────────────────────────────────
    console.log(`[Buffer] ✅ Speech→Silence detected after ${silenceDuration}ms, sending ${this.chunks.length} chunks (${estimatedBlobSize} bytes)`);
    this.lastSendTime = now;
    this.silenceStartTime = null;

    // 发送当前 chunks（仅新累积的音频）
    const chunksToSend = [...this.chunks];
    this.chunks = []; // 立即清空，防止重复发送

    this.processAndSend(chunksToSend, false).catch(console.error);
  }

  /**
   * 发送音频到 Whisper API
   * @param isFinalFlush 是否为最终刷新（停止录音时），此时跳过大小检查
   */
  private async processAndSend(chunksToSend: Blob[], isFinalFlush: boolean): Promise<void> {
    this.isProcessing = true;

    try {
      const mergedBlob = new Blob(chunksToSend, { type: 'audio/webm' });
      const estimatedDuration = chunksToSend.length * this.CHUNK_DURATION_MS;

      console.log(`[Send] 📤 ${isFinalFlush ? 'FINAL' : 'BUFFERED'} blob: ${mergedBlob.size} bytes, ~${estimatedDuration}ms (${chunksToSend.length} chunks)`);

      // ── MINIMUM SIZE CHECK ───────────────────────────────────────────────
      // 非最终刷新必须满足最小大小，防止静音/噪声发送
      if (!isFinalFlush && mergedBlob.size < this.MIN_AUDIO_SIZE_BYTES) {
        console.log(`[Send] ⚠️ Audio too small (${mergedBlob.size} < ${this.MIN_AUDIO_SIZE_BYTES}), skipping`);
        this.isProcessing = false;
        return;
      }

      const result = await this.sendToWhisperAPI(mergedBlob);

      if (result?.is_valid && result.text) {
        const text = result.text.trim();

        if (text.length < 2) {
          console.log("[Send] ⚠️ Text too short, skipping");
          this.isProcessing = false;
          return;
        }

        const hash = this.simpleHash(text);

        // ── STABILITY TRACKING ─────────────────────────────────────────────
        const now = Date.now();
        const existing = this.recentTranscripts.get(hash);

        let isStable = false;
        if (existing) {
          existing.count++;
          existing.lastSeen = now;
          if (existing.count >= 2) {
            isStable = true;
          }
          this.cleanupOldTranscripts(now);
        } else {
          this.recentTranscripts.set(hash, { text, count: 1, lastSeen: now });
          this.cleanupOldTranscripts(now);
        }

        const is_final = isStable || isFinalFlush;

        // Skip exact duplicates for interim results
        if (!is_final && hash === this.lastHash) {
          console.log("[Send] 🔄 Exact duplicate interim, skipping");
          this.isProcessing = false;
          return;
        }

        this.lastText = text;
        this.lastHash = hash;
        this.consecutiveEmpty = 0;

        // ── TRANSLATION ─────────────────────────────────────────────────────
        let translated_text: string | undefined;

        if (this.options.enableTranslation && this.options.targetLanguage && is_final) {
          // Chỉ dịch khi kết quả final (tránh dịch nhiều lần)
          translated_text = await this.translateText(text, this.options.targetLanguage, this.options.sourceLanguage);
        }

        console.log(`[Send] ✅ ${is_final ? 'FINAL' : 'PARTIAL'}: "${text.substring(0, 60)}..."`);

        this.callbacks?.onTranscript({
          final_display: text,
          is_valid: true,
          confidence: result.confidence || 0.85,
          reason: result.reason,
          is_final: is_final,
          translated_text: translated_text || undefined,
        });
      } else {
        this.consecutiveEmpty++;
        console.log("[Send] ⚠️ Transcript rejected:", result?.reason || 'empty/invalid');
      }

    } catch (error) {
      console.error("[Send] ❌ Error:", error);
      this.callbacks?.onError("API error");
    } finally {
      this.isProcessing = false;
      this.trimChunks(); // 内存管理
    }
  }

  /**
   * ── MEMORY MANAGEMENT ─────────────────────────────────────────────────────
   * 安全限制：防止意外累积过多 chunks
   */
  private trimChunks(): void {
    const MAX_CHUNKS = 100; // ~20秒上限（保护性措施）

    if (this.chunks.length > MAX_CHUNKS) {
      const excess = this.chunks.length - MAX_CHUNKS;
      this.chunks = this.chunks.slice(excess);
      console.log(`[Processor] 🗑️ Safety trim: removed ${excess} old chunks, kept ${this.chunks.length}`);
    }
  }

  /**
   * ── ORIGINAL processBufferedChunks (保留用于最终刷新) ───────────────────
   * final flush 会发送所有剩余 chunks 并清空缓冲区
   */
  private async processBufferedChunks(isFinalFlush: boolean = false): Promise<void> {
    // 最终刷新时发送所有 chunk
    if (isFinalFlush) {
      const allChunks = [...this.chunks];
      this.chunks = []; // 立即清空，防止重复
      await this.processAndSend(allChunks, true);
      return;
    }

    // 对于非最终刷新，此方法已被新的 evaluateBuffer 系统取代
    // 保持空实现以避免中断
    console.log("[Processor] ⚠️ processBufferedChunks called without evaluateBuffer, this should not happen");
  }

  /**
   * Stop recording and guarantee final transcript
   * - Waits 500ms for final chunks to arrive
   * - Processes ALL accumulated audio
   * - Awaits API result before resolving
   */
  stop(): Promise<void> {
    console.log("[Processor] === STOP RECORDING === [ENTRY]");
    return new Promise((resolve) => {
      if (!this.isRecording) {
        console.log("[Processor] Not recording, resolve immediately");
        resolve();
        return;
      }

      console.log("[Processor] === STOP RECORDING ===");
      this.isRecording = false;
      this.isStopping = true;
      this.stopPromiseResolver = resolve;

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try {
          console.log("[Processor] MediaRecorder state:", this.mediaRecorder.state);
          console.log("[Processor] 🛑 Calling mediaRecorder.stop()");
          this.mediaRecorder.stop();
          console.log("[Processor] ⏳ [STOP FLUSH] Waiting 500ms for final chunks...");
          setTimeout(() => {
            console.log("[Processor] [STOP FLUSH] 500ms elapsed, finalizing...");
            this.finalizeStop();
          }, 800);
        } catch (e) {
          console.error("[Processor] ❌ Stop error:", e);
          this.isStopping = false;
          resolve();
        }
      } else {
        console.log("[Processor] MediaRecorder already inactive");
        this.finalizeStop();
      }
    });
  }

  /**
   * Finalize stop: run final flush and cleanup
   */
  private async finalizeStop(): Promise<void> {
    console.log("[Processor] 🔄 finalizeStop()");

    // Wait for any ongoing interim processing
    if (this.isProcessing) {
      console.log("[Processor] ⏳ Waiting for ongoing processing to finish...");
      const start = Date.now();
      while (this.isProcessing && Date.now() - start < 3000) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Run final flush (if not already done)
    if (!this.finalFlushDone) {
      await this.processBufferedChunks(true);
    } else {
      console.log("[Processor] ✅ Final flush already completed");
    }

    // Ensure we've finished
    console.log("[Processor] ⏳ Ensuring final processing complete...");
    const start = Date.now();
    while (this.isProcessing && Date.now() - start < 3000) {
      await new Promise(r => setTimeout(r, 100));
    }

    console.log("[Processor] ✅ Stop finalized");
    this.isStopping = false;
    this.isFinalized = true;

    // Clear partial transcript tracking for next session
    this.recentTranscripts.clear();

    this.callbacks?.onStateChange("idle");

    if (this.stopPromiseResolver) {
      this.stopPromiseResolver();
      this.stopPromiseResolver = null;
    }
  }

  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 50); i++) {
      hash = (hash * 31 + text.charCodeAt(i)) & 0xFFFFFF;
    }
    return hash;
  }

  /**
   * Dịch văn bản sang ngôn ngữ đích
   */
  private async translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string | undefined> {
    const srcLang = sourceLanguage || this.options.sourceLanguage || 'vi';
    const translateService = this.options.translateService || 'mymemory';

    // Nếu ngôn ngữ nguồn và đích giống nhau, trả về text gốc
    if (srcLang === targetLanguage) {
      console.log(`[Translate] ℹ️ Source and target languages are the same (${srcLang}), skipping translation`);
      return text;
    }

    const cacheKey = `${text}_${srcLang}_${targetLanguage}_${translateService}`;

    // Kiểm tra cache trước
    if (this.translationCache.has(cacheKey)) {
      console.log('[Translate] ✅ Cache hit');
      return this.translationCache.get(cacheKey);
    }

    try {
      console.log(`[Translate] 🌐 Translating from ${srcLang} to ${targetLanguage} using ${translateService}...`);

      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          sourceLang: srcLang,
          targetLang: targetLanguage,
          service: translateService,
        }),
      });

      if (!response.ok) {
        console.error('[Translate] ❌ API error:', response.status);
        return undefined;
      }

      const data = await response.json();

      if (data.success && data.translated_text) {
        const translated = data.translated_text as string;
        
        // Nếu translation giống text gốc hoặc rỗng, bỏ qua
        if (translated === text || translated.trim() === '') {
          console.log('[Translate] ⚠️ Translation returned same text, skipping');
          return undefined;
        }
        
        // Cache kết quả
        this.translationCache.set(cacheKey, translated);

        // Giới hạn cache size (giữ 100 mục gần nhất)
        if (this.translationCache.size > 100) {
          const firstKey = this.translationCache.keys().next().value;
          if (firstKey !== undefined) {
            this.translationCache.delete(firstKey);
          }
        }

        console.log('[Translate] ✅ Translation completed');
        return data.translated_text;
      } else {
        console.warn('[Translate] ⚠️ Translation failed:', data);
        return undefined;
      }

    } catch (error) {
      console.error('[Translate] ❌ Error:', error);
      return undefined;
    }
  }

  /**
   * Clean up old transcript tracking entries
   */
  private cleanupOldTranscripts(now: number): void {
    const expireTime = now - this.STABILITY_WINDOW_MS * 2;
    for (const [hash, data] of this.recentTranscripts.entries()) {
      if (data.lastSeen < expireTime) {
        this.recentTranscripts.delete(hash);
      }
    }
  }

  private async sendToWhisperAPI(audioBlob: Blob): Promise<{
    text: string;
    is_valid: boolean;
    reason?: string;
    confidence?: number;
  }> {
    console.log(`[Processor] 🎤 Sending to API: size=${audioBlob.size} bytes, type=${audioBlob.type}`);

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');

    try {
      const response = await fetch('/api/whisper', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`[Processor] ❌ API error ${response.status}:`, data);
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
      }

      console.log(`[Processor] ✅ API response:`, data);
      return {
        text: data.text || '',
        is_valid: data.is_valid ?? true,
        reason: data.reason,
        confidence: data.confidence,
      };

    } catch (error) {
      console.error("[Processor] ❌ API failure:", error);
      throw error;
    }
  }
}
