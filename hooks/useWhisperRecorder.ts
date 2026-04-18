"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useCall } from "@stream-io/video-react-sdk";
import { TranscriptionProcessor } from "../lib/transcription/processor";
import { VoiceActivityDetector } from "../lib/audio/vad";
import type { TranscriptionResult } from "@/lib/transcription/config";

export type TranscriptEntry = {
  id: string;
  userId: string;
  name: string;
  text: string;
  translated_text?: string; // English translation (optional)
  timestamp: number;
  updatedAt: number;
  isFinal?: boolean;
  confidence?: number;
  reason?: string;
};

export type RecorderStatus = "idle" | "recording" | "stopping" | "error";

interface UseWhisperRecorderOptions {
  chunkIntervalMs?: number;
  maxBufferSeconds?: number;
  trimToSeconds?: number;
  targetSampleRate?: number;
  maxTranscripts?: number;
  volumeThreshold?: number;
  minSpeechDurationMs?: number;
  silenceTimeoutMs?: number;
  useAdaptiveThreshold?: boolean;
  noiseFloorWindowMs?: number;
  /** 启用翻译 */
  enableTranslation?: boolean;
  targetLanguage?: string; // e.g. 'en', 'zh', 'ja'
  onTranscript?: (entry: TranscriptEntry) => void;
  onError?: (error: string) => void;
  onVADStateChange?: (isSpeaking: boolean) => void;
}


export function useWhisperRecorder({
  chunkIntervalMs = 2000, // 
  maxBufferSeconds = 15, // 
  trimToSeconds = 3,
  targetSampleRate = 16000,
  maxTranscripts = 30,
  volumeThreshold = 0.035,
  minSpeechDurationMs = 300,
  silenceTimeoutMs = 1200,
  useAdaptiveThreshold = true,
  noiseFloorWindowMs = 100,
  enableTranslation = false,
  targetLanguage = "en",
  onTranscript,
  onError,
  onVADStateChange,
}: UseWhisperRecorderOptions = {}) {
  const call = useCall();

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);

  // Refs
  const processorRef = useRef<TranscriptionProcessor | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const callRef = useRef(call);
  const isRecordingRef = useRef(false);
  const isVADInitializedRef = useRef(false);
  const lastTranscriptRef = useRef<string>('');
  const lastTranscriptTimeRef = useRef<number>(0);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  /**
   * 启动录音（带 VAD 控制）
   * - VAD 检测到语音时启动 MediaRecorder
   * - 静音超时后自动停止 MediaRecorder
   */
  const startRecording = useCallback(async () => {
    console.log("[useWhisper] === START RECORDING WITH VAD ===");

    if (isRecordingRef.current) {
      console.log("[useWhisper] Already recording, ignoring");
      return;
    }

    const currentCall = callRef.current;
    if (!currentCall) {
      onError?.("Chưa kết nối cuộc gọi");
      setStatus("error");
      return;
    }

    const participant = currentCall.state.localParticipant;
    if (!participant) {
      onError?.("Không tìm thấy thông tin participant");
      setStatus("error");
      return;
    }

    console.log("[useWhisper] Participant:", {
      userId: participant.userId,
      name: participant.name,
    });

    // Lấy audio stream từ participant
    let audioStream: MediaStream | undefined = undefined;

    // Cách 1: participant.audioStream (có thể là MediaStream)
    if (participant.audioStream instanceof MediaStream) {
      audioStream = participant.audioStream;
      console.log("[useWhisper] Got audioStream from participant.audioStream (MediaStream)");
    } else if (participant.audioStream && typeof (participant.audioStream as any)?.getTracks === 'function') {
      audioStream = participant.audioStream as unknown as MediaStream;
      console.log("[useWhisper] Got audioStream from participant.audioStream (cast)");
    }

    // Cách 2: Lấy từ audioTracks
    const audioTracks = (participant as any)?.audioTracks;
    if (!audioStream && audioTracks && typeof audioTracks?.size === 'number' && audioTracks.size > 0) {
      const audioTrackArray = Array.from(audioTracks.values());
      const firstTrack = audioTrackArray[0] as any;

      if (firstTrack?.mediaStream instanceof MediaStream) {
        audioStream = firstTrack.mediaStream;
        console.log("[useWhisper] Got audioStream from audioTrack.mediaStream");
      } else if (firstTrack?.track instanceof MediaStreamTrack) {
        audioStream = new MediaStream([firstTrack.track]);
        console.log("[useWhisper] Created MediaStream from audioTrack.track");
      }
    }

    if (!audioStream) {
      console.warn("[useWhisper] No audio stream available. Microphone might be off.");
      onError?.("Không tìm thấy audio stream. Hãy bật microphone.");
      setStatus("error");
      return;
    }

    // ── STEP 1: Create and initialize VAD ─────────────────────────────────
    const vad = new VoiceActivityDetector({
      volumeThreshold: volumeThreshold,
      minSpeechDurationMs: minSpeechDurationMs,
      silenceTimeoutMs: silenceTimeoutMs,
      useAdaptiveThreshold: useAdaptiveThreshold,
      noiseFloorWindowMs: noiseFloorWindowMs,
    });

    if (!vad.initialize(audioStream)) {
      console.error("[useWhisper] VAD initialization failed");
      onError?.("Không thể khởi tạo VAD");
      setStatus("error");
      return;
    }

    vadRef.current = vad;

    // VAD event handlers
    vad.setOnSpeechStart(() => {
      console.log("[useWhisper] VAD: Speech started");

      // Start MediaRecorder if not already recording
      if (processorRef.current && !processorRef.current.getIsRecording()) {
        console.log("[useWhisper] Starting MediaRecorder due to speech");
        processorRef.current.start(audioStream);
      }

      // 通知 TranscriptionProcessor：用户开始说话
      processorRef.current?.setSpeakingState(true);

      onVADStateChange?.(true);
    });

    vad.setOnSpeechEnd(() => {
      console.log("[useWhisper] VAD: Speech ended");

      onVADStateChange?.(false);

      // 通知 TranscriptionProcessor：用户停止说话（开始静音）
      processorRef.current?.setSpeakingState(false);

      // Auto-stop MediaRecorder after silenceTimeoutMs
      setTimeout(() => {
        if (processorRef.current && processorRef.current.getIsRecording() && !vad.isCurrentlySpeaking()) {
          console.log("[useWhisper] Silence timeout reached, stopping MediaRecorder");
          processorRef.current.stop();
        }
      }, silenceTimeoutMs + 200);
    });

    // Start VAD analysis
    vad.start();

    // ── STEP 2: Create TranscriptionProcessor ─────────────────────────────
    const processor = new TranscriptionProcessor(
      {
        chunkIntervalMs,
        maxBufferSeconds,
        sampleRate: targetSampleRate,
      },
      participant.userId,
      participant.name || "User"
    );

    // Set callbacks
    processor.setCallbacks(
      (result: TranscriptionResult) => {
        console.log("[useWhisper] Transcription received:", result);

        const timestamp = Date.now();
        const newText = result.final_display.trim();

        // Skip empty text
        if (!newText || newText.length < 2) {
          return;
        }

        // Check duplicate EXACT MATCH only (allow prefix extensions for interim)
        if (lastTranscriptRef.current) {
          const lastText = lastTranscriptRef.current;

          // Skip EXACT duplicates
          if (newText === lastText && !result.is_final) {
            console.log("[useWhisper] Exact duplicate interim, skipping");
            return;
          }

          // Skip if new is shorter AND prefix of old (truncated interim)
          if (!result.is_final && newText.length < lastText.length && lastText.startsWith(newText)) {
            console.log("[useWhisper] Shorter/truncated interim, skipping");
            return;
          }
        }

        // Update last transcript
        lastTranscriptRef.current = newText;
        lastTranscriptTimeRef.current = timestamp;

        const entry: TranscriptEntry = {
          id: `${participant.userId}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          userId: participant.userId,
          name: participant.name || "User",
          text: newText,
          timestamp,
          updatedAt: timestamp,
          isFinal: result.is_final ?? false,
          confidence: result.confidence,
          reason: result.reason,
        };

        setTranscripts((prev) => {
          const next = [...prev, entry];
          const result = next.slice(-maxTranscripts);
          return result;
        });

        console.log("[useWhisper] Transcript received:", newText, "(final:", result.is_final, ")");
        onTranscript?.(entry);
      },
      (error: string) => {
        console.error("[useWhisper] Processor error:", error);
        onError?.(error);
      },
      (state: string) => {
        console.log("[useWhisper] Processor state change:", state);
        if (state === "recording") {
          setStatus("recording");
        } else if (state === "idle") {
          setStatus("idle");
        }
      }
    );

    processorRef.current = processor;
    isRecordingRef.current = true;
    isVADInitializedRef.current = true;

    // VAD will automatically start MediaRecorder when speech is detected
    // No need to call processor.start() here

    setStatus("recording");
    console.log("[useWhisper] VAD started, waiting for speech...");
  }, [
    chunkIntervalMs,
    maxBufferSeconds,
    targetSampleRate,
    maxTranscripts,
    volumeThreshold,
    minSpeechDurationMs,
    silenceTimeoutMs,
    useAdaptiveThreshold,
    noiseFloorWindowMs,
    onTranscript,
    onError,
    onVADStateChange,
  ]);

  /**
   * 停止录音
   */
  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;

    console.log("[useWhisper] === STOP RECORDING ===");
    isRecordingRef.current = false;
    setStatus("stopping");

    // Stop MediaRecorder processor first
    const processor = processorRef.current;
    if (processor) {
      console.log("[useWhisper] Stopping processor...");
      await processor.stop();
      processorRef.current = null;
      console.log("[useWhisper] Processor stopped");
    }

    // Stop VAD
    const vad = vadRef.current;
    if (vad) {
      console.log("[useWhisper] Stopping VAD...");
      vad.stop();
      vadRef.current = null;
      console.log("[useWhisper] VAD stopped");
    }

    setStatus("idle");
    console.log("[useWhisper] Recording fully stopped");
  }, []);

  /**
   * 检查是否可以录音
   */
  const canRecord = !!(call?.state?.localParticipant?.audioStream);

  // ── Cleanup on unmount (only if recording) ────────────────────────────
  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        console.log("[useWhisper] Component unmount, stopping everything...");

        // Stop processor
        if (processorRef.current) {
          processorRef.current.stop();
        }

        // Stop VAD
        if (vadRef.current) {
          vadRef.current.stop();
        }
      }
    };
  }, []);

  // Helper: tính similarity giữa 2 chuỗi (0-1)
  const calculateSimilarity = useCallback((str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1;

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }, []);

  const levenshteinDistance = useCallback((str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }
    return matrix[str2.length][str1.length];
  }, []);

  return {
    status,
    transcripts,
    startRecording,
    stopRecording,
    isRecording: status === "recording",
    canRecord,
  };
}
