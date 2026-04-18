/**
 * Transcription Config và Types
 */

export interface TranscriptionResult {
  final_display: string;
  is_valid: boolean;
  confidence?: number;
  reason?: string;
  is_final?: boolean; // true = final/confirmed, false = partial/interim
}

export interface TranscriptionProcessorOptions {
  chunkIntervalMs: number;
  maxBufferSeconds: number;
  sampleRate: number;
}

export interface TranscriptionCallbacks {
  onTranscript: (result: TranscriptionResult) => void;
  onError: (error: string) => void;
  onStateChange: (state: string) => void;
}
