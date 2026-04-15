"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useCall } from "@stream-io/video-react-sdk";
import { TranscriptionProcessor } from "../lib/transcription/processor";
import type { TranscriptionResult } from "@/lib/transcription/config";

export type TranscriptEntry = {
  id: string;
  userId: string;
  name: string;
  text: string;
  timestamp: number;
  updatedAt: number;
  isFinal?: boolean; // 是否是最终确认的文本
  confidence?: number;
  reason?: string; // 如果被拒绝，记录原因
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

/**
 * 增强版 Whisper Recorder Hook
 *
 * 新特性：
 * 1. 滑动窗口转录 - 10-15秒缓冲，每2秒处理
 * 2. 严格幻觉检测 - 过滤YouTube风格短语
 * 3. 文本合并 - 自动去除重叠部分，保持连续
 * 4. 低延迟 - 快速返回部分结果
 * 5. 可选实时翻译
 */
export function useWhisperRecorder({
  chunkIntervalMs = 2000, // 每2秒处理一次
  maxBufferSeconds = 15, // 缓冲最大15秒
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
  const callRef = useRef(call);
  const isRecordingRef = useRef(false);
  const lastTranscriptRef = useRef<string>('');
  const lastTranscriptTimeRef = useRef<number>(0);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  /**
   * 启动录音
   */
  const startRecording = useCallback(async () => {
    console.log("[useWhisper] === START RECORDING ===");

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
      // Có thể là MediaStream-like object
      audioStream = participant.audioStream as unknown as MediaStream;
      console.log("[useWhisper] Got audioStream from participant.audioStream (cast)");
    }

    // Cách 2: Lấy từ audioTracks (nếu tồn tại)
    const audioTracks = (participant as any)?.audioTracks;
    if (!audioStream && audioTracks && typeof audioTracks?.size === 'number' && audioTracks.size > 0) {
      const audioTrackArray = Array.from(audioTracks.values());
      const firstTrack = audioTrackArray[0] as any;
      console.log("[useWhisper] Audio track:", firstTrack);

      if (firstTrack?.mediaStream instanceof MediaStream) {
        audioStream = firstTrack.mediaStream;
        console.log("[useWhisper] Got audioStream from audioTrack.mediaStream");
      } else if (firstTrack?.track instanceof MediaStreamTrack) {
        // Tạo MediaStream từ MediaStreamTrack
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

    // 创建处理器
    const processor = new TranscriptionProcessor(
      {
        chunkIntervalMs,
        maxBufferSeconds,
        sampleRate: targetSampleRate,
      },
      participant.userId,
      participant.name || "User"
    );

    // 设置回调
    processor.setCallbacks(
      (result: TranscriptionResult) => {
        console.log("[useWhisper] Transcription received:", result);

        const timestamp = Date.now();
        const newText = result.final_display.trim();

        // Avoid empty text
        if (!newText || newText.length < 2) {
          return;
        }

        // Check duplicate với text trước đó (dùng ref)
        if (lastTranscriptRef.current) {
          // Nếu text mới bắt đầu bằng text cũ → bỏ qua (incremental)
          if (newText.startsWith(lastTranscriptRef.current)) {
            console.log("[useWhisper] Duplicate/incremental text, skipping");
            return;
          }
          // Nếu text cũ bắt đầu bằng mới → cũ hơn, bỏ qua mới
          if (lastTranscriptRef.current.startsWith(newText)) {
            console.log("[useWhisper] Shorter duplicate, skipping");
            return;
          }
        }

        // Cập nhật last transcript
        lastTranscriptRef.current = newText;
        lastTranscriptTimeRef.current = timestamp;

        const entry: TranscriptEntry = {
          id: `${participant.userId}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          userId: participant.userId,
          name: participant.name || "User",
          text: newText,
          timestamp,
          updatedAt: timestamp,
          isFinal: result.is_valid,
          confidence: result.confidence,
          reason: result.reason,
        };

        setTranscripts((prev) => {
          const next = [...prev, entry];
          // Giới hạn số lượng
          return next.slice(-maxTranscripts);
        });

        onTranscript?.(entry);
      },
      (error: string) => {
        console.error("[useWhisper] Processor error:", error);
        onError?.(error);
      },
      (state: string) => {
        console.log("[useWhisper] State change:", state);
        if (state === "recording") {
          setStatus("recording");
        } else if (state === "idle") {
          setStatus("idle");
        }
      }
    );

    processorRef.current = processor;
    isRecordingRef.current = true;

    // 启动处理器 với audio stream đã lấy được
    console.log("[useWhisper] Audio stream:", audioStream ? "found" : "not found");
    processor.start(audioStream);

    setStatus("recording");
    console.log("[useWhisper] Recording started");
  }, [
    chunkIntervalMs,
    maxBufferSeconds,
    targetSampleRate,
    maxTranscripts,
    onTranscript,
    onError,
  ]);

  /**
   * 停止录音
   */
  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;

    console.log("[useWhisper] === STOP RECORDING ===");
    isRecordingRef.current = false;
    setStatus("stopping");

    const processor = processorRef.current;
    if (processor) {
      processor.stop();
      processorRef.current = null;
    }

    setStatus("idle");
    console.log("[useWhisper] Recording stopped");
  }, []);

  /**
   * 检查是否可以录音
   */
  const canRecord = !!(call?.state?.localParticipant?.audioStream);

  // ── Cleanup on unmount (only if recording) ────────────────────────────
  useEffect(() => {
    return () => {
      if (isRecordingRef.current && processorRef.current) {
        processorRef.current.stop();
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
