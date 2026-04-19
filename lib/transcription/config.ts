/**
 * Transcription Config và Types
 */

export interface TranscriptionResult {
  final_display: string;
  is_valid: boolean;
  confidence?: number;
  reason?: string;
  is_final?: boolean; // true = final/confirmed, false = partial/interim
  translated_text?: string; // English translation (optional)
}

export interface TranscriptionProcessorOptions {
  chunkIntervalMs: number;
  maxBufferSeconds: number;
  sampleRate: number;
  sourceLanguage?: string; // Ngôn ngữ nguồn (ví dụ: 'vi', 'en')
  enableTranslation?: boolean;
  targetLanguage?: string;
  translateService?: 'mymemory' | 'openai' | 'deepl';
}

export interface TranscriptionCallbacks {
  onTranscript: (result: TranscriptionResult) => void;
  onError: (error: string) => void;
  onStateChange: (state: string) => void;
}
