import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { convertToWavBuffer } from '@/lib/transcription/ffmpeg-converter';

const WHISPER_EXE_PATH = process.env.WHISPER_EXE_PATH || 'E:\\appsieucap\\AI\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe';
const WHISPER_MODEL_PATH = process.env.WHISPER_MODEL_PATH || 'E:\\appsieucap\\AI\\whisper.cpp\\models\\ggml-medium-q5_0.bin';

const BANNED_PHRASES: string[] = [
  // Các cụm từ spam YouTube/stream hoàn toàn
  "don't forget to",
  "đừng quên đăng ký",
  "đừng quên",
  "remember to",
  "support me on",
  "ủng hộ tôi",
  "patreon",
  "membership",
  "sponsor",
  "tài trợ",
  "click the link",
  "click on",
  "link in",
  "description below",
  "bio",
  "thank you for watching",
  "cảm ơn đã xem",
  "thanks for watching",
  "see you in the next video",
  "hẹn gặp lại",
  "goodbye",
  "tạm biệt",
  "bye bye",
  // Bỏ các từ chào hỏi - chúng là speech bình thường
  // "hello everyone",
  // "hi everyone",
  // "what's up",
  // "chào mừng",
  // "how are you",
  // "how's it going",
  // "what's going on",
];

function getAudioDuration(wavPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobePath = 'E:\\gear\\ffmpeg-2026-04-09-git-d3d0b7a5ee-full_build\\bin\\ffprobe.exe';
    const ffprobe = spawn(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      wavPath,
    ]);

    let stdout = '';
    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        resolve(parseFloat(stdout.trim()));
      } else {
        reject(new Error('ffprobe failed'));
      }
    });

    ffprobe.on('error', reject);
  });
}

function containsBannedPhrase(text: string): { passed: boolean; matchedPhrase?: string } {
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      return { passed: false, matchedPhrase: phrase };
    }
  }
  return { passed: true };
}

function validateTextLength(
  text: string,
  durationSeconds: number
): { passed: boolean; maxAllowed?: number } {
  // Cho phép threshold linh hoạt hơn
  // File ngắn (<1s): cho phép tối đa 150 chars (Whisper có thể summarize)
  // File 1-2s: cho phép 100 chars
  // File dài: 40 char/giây
  if (durationSeconds < 1) {
    if (text.length <= 150) return { passed: true };
  } else if (durationSeconds < 2) {
    if (text.length <= 100) return { passed: true };
  }

  const maxCharsPerSecond = 40;
  const maxAllowed = Math.floor(durationSeconds * maxCharsPerSecond);

  // Check với 1.5x tolerance cho file 2-5s, 1.2x cho file >5s
  const tolerance = durationSeconds < 5 ? 1.5 : 1.2;
  if (text.length > maxAllowed * tolerance) {
    return { passed: false, maxAllowed };
  }

  return { passed: true };
}

function checkRepetition(text: string): { passed: boolean; reason?: string } {
  const words = text.trim().split(/\s+/);

  if (words.length < 5) return { passed: true }; // Quá ngắn không check

  // Chỉ check lặp 5 lần trở lên (thay vì 4) - cho phép nhắc lại tự nhiên
  for (let i = 0; i < words.length - 4; i++) {
    if (words[i] === words[i + 1] && words[i] === words[i + 2] && words[i] === words[i + 3] && words[i] === words[i + 4]) {
      return { passed: false, reason: `Word "${words[i]}" repeated 5 times` };
    }
  }

  // Check phrase lặp: 4-5 từ lặp lại (thay vì 3-4)
  for (let len = 4; len <= 5; len++) {
    for (let i = 0; i <= words.length - len * 2; i++) {
      const phrase1 = words.slice(i, i + len).join(' ');
      const phrase2 = words.slice(i + len, i + len * 2).join(' ');
      if (phrase1 === phrase2) {
        return { passed: false, reason: `Phrase "${phrase1}" repeated` };
      }
    }
  }

  return { passed: true };
}

function parseTranscription(stdout: string): string {
  // Strip ANSI escape codes (colors)
  const withoutAnsi = stdout.replace(/\x1b\[[0-9;]*m/g, '');

  const lines = withoutAnsi.split('\n');
  let transcription = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip log lines
    if (
      trimmed.startsWith('whisper_') ||
      trimmed.startsWith('...') ||
      trimmed.includes('%') ||
      trimmed.startsWith('loading') ||
      trimmed.startsWith('system') ||
      trimmed.startsWith('avg') ||
      trimmed.includes('tokens') ||
      trimmed.includes('ms/') ||
      trimmed.includes('sampling rate') ||
      trimmed.includes('threads') ||
      trimmed.includes('power') ||
      trimmed.includes('encode') ||
      (trimmed.startsWith('[') && trimmed.includes(']') && !trimmed.includes('-->'))
    ) {
      continue;
    }

    // Skip if it's just noise/technical strings
    if (trimmed.length < 2) continue;

    // Skip if it looks like technical debug (contains lots of numbers/symbols)
    // Lower threshold to 0.15 to keep Vietnamese text (many diacritics)
    const alnumRatio = (trimmed.match(/[a-zA-Z\u00C0-\u1EF9]/g) || []).length / trimmed.length;
    if (alnumRatio < 0.15 && trimmed.length > 5) continue;

    // Only add lines with readable text
    if (/[a-zA-Z\u00C0-\u1EF9]/.test(trimmed)) {
      transcription += trimmed + ' ';
    }
  }

  return transcription.replace(/\s+/g, ' ').trim();
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Whisper API] === Received request ===');
    const formData = await request.formData();

    // Debug: Log all formData fields
    console.log('[Whisper API] FormData fields:');
    for (const [key, value] of formData.entries()) {
      const v = value as any;
      console.log(`  ${key}:`, typeof v === 'object' ? `Object (size: ${v.size}, type: ${v.type})` : String(v).substring(0, 50));
    }

    const file = formData.get('file') as File | null;
    const userId = formData.get('userId') as string | null;
    const userName = formData.get('userName') as string | null;

    console.log('[Whisper API] Extracted:', {
      file: file ? { name: file.name, size: file.size, type: file.type } : 'MISSING',
      userId: userId ?? 'MISSING',
      userName: userName ?? 'MISSING',
    });

    if (!file) {
      console.warn('[Whisper API] ❌ No file provided in formData');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`[Whisper API] File: ${file.name}, size: ${file.size}, type: ${file.type}`);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    console.log(`[Whisper API] Received audio: ${buffer.length} bytes`);
    console.log(`[Whisper API] First 16 bytes (hex):`, buffer.slice(0, 16).toString('hex'));
    console.log(`[Whisper API] First 16 bytes (utf8):`, buffer.slice(0, 16).toString('utf8'));

    // DEBUG: Save raw file to check format
    const tempDir = os.tmpdir();
    const debugDir = path.join(tempDir, 'debug');
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
    const debugPath = path.join(debugDir, `raw-${Date.now()}.webm`);
    fs.writeFileSync(debugPath, buffer);
    console.log(`[Whisper API] DEBUG: Saved raw file to: ${debugPath}`);

    // Validate file size
    if (buffer.length < 100) {
      console.warn('[Whisper API] ❌ File too small:', buffer.length, 'bytes');
      console.warn('[Whisper API] First 20 bytes (hex):', buffer.slice(0, 20).toString('hex'));
      return NextResponse.json({ error: 'Audio file too small' }, { status: 400 });
    }

    console.log('[Whisper API] Converting audio to WAV via pipe...');

    // Convert buffer trực tiếp qua ffmpeg pipe (tránh lỗi file)
    let wavBuffer: Buffer;
    try {
      wavBuffer = await convertToWavBuffer(buffer);
      console.log('[Whisper API] Conversion successful, WAV size:', wavBuffer.length, 'bytes');

      // VALIDATE: WAV file size < 10KB → reject
      if (wavBuffer.length < 10000) {
        console.warn('[Whisper API] ❌ WAV file too small:', wavBuffer.length, 'bytes (< 10KB)');
        return NextResponse.json(
          { error: 'Audio file too small after conversion', details: `WAV size: ${wavBuffer.length} bytes` },
          { status: 400 }
        );
      }

    } catch (convError: any) {
      console.error('[Whisper API] ❌ Conversion failed:', convError.message);
      console.error('[Whisper API] ❌ Conversion stack:', convError.stack?.substring(0, 200));
      return NextResponse.json(
        { error: 'Audio conversion failed', details: convError.message },
        { status: 500 }
      );
    }

    // Write WAV to temp file cho ffprobe và whisper
    const wavFilePath = path.join(tempDir, `whisper-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.wav`);
    console.log(`[Whisper API] Writing WAV temp file: ${wavFilePath}`);
    fs.writeFileSync(wavFilePath, wavBuffer);

    // Get duration
    let durationSeconds: number;
    try {
      durationSeconds = await getAudioDuration(wavFilePath);
      console.log('[Whisper API] Audio duration:', durationSeconds.toFixed(2), 's');

      // VALIDATE: Duration < 1s → skip (too short for meaningful transcription)
      if (durationSeconds < 1) {
        console.warn('[Whisper API] ❌ Audio too short:', durationSeconds.toFixed(2), 's (< 1s)');
        try { fs.unlinkSync(wavFilePath); } catch (e) {}
        return NextResponse.json({
          text: '',
          userName: userName || 'Unknown',
          userId: userId || 'unknown',
          is_valid: false,
          reason: 'Audio too short (less than 1 second)',
          duration: durationSeconds,
          confidence: 0,
        });
      }
    } catch (durationError: any) {
      console.error('[Whisper API] ❌ Failed to get duration:', durationError.message);
      try { fs.unlinkSync(wavFilePath); } catch (e) {}
      return NextResponse.json(
        { error: 'Failed to get audio duration', details: durationError.message },
        { status: 500 }
      );
    }

    // Tối ưu: giảm threads, batch size cho latency thấp hơn
    const args = [
      '-m', WHISPER_MODEL_PATH,
      '-f', wavFilePath,
      '-l', 'vi',
      '-t', '2', // threads
      '-bs', '4', // batch size
      '-dev', '0',
      '--no-timestamps',
      '-nt', // no translations
      '--temperature', '0', // deterministic
      '--best-of', '3', // beam search
      '--beam-size', '3',
      '-nf', // no fallback to other temperatures
    ];

    return new Promise((resolve) => {
      const whisper = spawn(WHISPER_EXE_PATH, args, {
        cwd: path.dirname(wavFilePath),
        windowsHide: true,
        env: {
          ...process.env,
          CUDA_VISIBLE_DEVICES: '0',
          GGML_CUDA: 'true',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      // Giảm timeout xuống 30s cho latency tốt hơn
      const timeout = setTimeout(() => {
        console.warn('[Whisper API] Timeout - killing process');
        try { whisper.kill('SIGTERM'); } catch (e) {}
      }, 30000);

      whisper.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      whisper.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      whisper.on('close', (code) => {
        clearTimeout(timeout);

        // Cleanup WAV temp file only
        try { fs.unlinkSync(wavFilePath); } catch (e) {}

        console.log(`[Whisper API] Whisper exit code: ${code}`);
        console.log(`[Whisper API] Full stderr (${stderr.length} chars):`, stderr);
        console.log(`[Whisper API] Full stdout (${stdout.length} chars):`, stdout);

        if (code !== 0) {
          console.error('[Whisper API] ❌ Whisper failed');
          resolve(NextResponse.json(
            { error: 'Whisper failed', details: stderr.substring(0, 500) },
            { status: 500 }
          ));
          return;
        }

        console.log('[Whisper API] Raw stdout:\n' + stdout);

        const rawTranscription = parseTranscription(stdout);
        console.log('[Whisper API] Parsed:', rawTranscription);

        let is_valid = true;
        let reason = '';

        if (!rawTranscription || rawTranscription.trim().length === 0) {
          is_valid = false;
          reason = 'Empty transcription';
        } else {
          const cleanText = rawTranscription.trim();

          // Validation nhẹ nhàng hơn, ưu tiên giữ text chất lượng
          const lengthCheck = validateTextLength(cleanText, durationSeconds);
          if (!lengthCheck.passed) {
            is_valid = false;
            reason = `Text too long: ${cleanText.length} chars`;
          }

          if (is_valid) {
            const bannedCheck = containsBannedPhrase(cleanText);
            if (!bannedCheck.passed) {
              is_valid = false;
              reason = `Banned phrase: "${bannedCheck.matchedPhrase}"`;
            }
          }

          if (is_valid) {
            const repeatCheck = checkRepetition(cleanText);
            if (!repeatCheck.passed) {
              is_valid = false;
              reason = repeatCheck.reason || 'Repetitive pattern';
            }
          }

          // Kiểm tra độ dài hợp lý
          if (is_valid && cleanText.length < 2) {
            is_valid = false;
            reason = 'Text too short';
          }

          // Kiểm tra tỷ lệ chữ cái (từ 0.2 thay vì 0.3 để ưu tiên tiếng Việt)
          if (is_valid) {
            const alnumCount = (cleanText.match(/[a-zA-Z0-9\u00C0-\u1EF9]/g) || []).length;
            if (alnumCount < cleanText.length * 0.2) {
              // Không reject, chỉ log warning
              console.log('[Whisper API] Warning: low alphanumeric ratio');
            }
          }

          // HALLUCINATION DETECTION - reject text không phải speech thông thường
          if (is_valid) {
            const lowerText = cleanText.toLowerCase();

            // Check các pattern YouTube/stream spam (thêm vào banned phrases)
            // Chỉ giữ các từ khóa spam thực sự, bỏ chào hỏi thông thường
            const spamPatterns = [
              /don't forget/i,
              /đừng quên/i,
              /remember/i,
              /nhớ/i,
              /support/i,
              /ủng hộ/i,
              /patreon/i,
              /membership/i,
              /thành viên/i,
              /sponsor/i,
              /tài trợ/i,
              /click/i,
              /link/i,
              /description/i,
              /mô tả/i,
              /bio/i,
              /tiểu sử/i,
              /thank you for watching/i,
              /cảm ơn đã xem/i,
              /thanks for watching/i,
              /see you in the next video/i,
              /hẹn gặp lại/i,
              /goodbye/i,
              /tạm biệt/i,
              /bye bye/i,
              // Bỏ các từ chào hỏi thông thường
              // /hello everyone/i,
              // /xin chào/i,
              // /hi everyone/i,
              // /what's up/i,
              // /chào mừng/i,
            ];

            for (const pattern of spamPatterns) {
              if (pattern.test(cleanText)) {
                is_valid = false;
                reason = `Hallucination: detected spam pattern`;
                break;
              }
            }

            // Check text bất thường: nhiều từ khóa không liên quan
            // Ví dụ: "subscribe cho kênh Ghiền Mì Gõ Để không bỏ lỡ"
            if (is_valid) {
              const suspiciousWords = ['subscribe', 'channel', 'kênh', 'video', 'stream', 'livestream', 'notification', 'thông báo'];
              const words = lowerText.split(/\s+/);
              let suspiciousCount = 0;
              for (const word of words) {
                if (suspiciousWords.includes(word)) {
                  suspiciousCount++;
                }
              }
              // Nếu có >2 từ suspicious trong text < 20 từ -> có thể hallucination
              if (suspiciousCount >= 2 && words.length <= 20) {
                is_valid = false;
                reason = `Hallucination: too many spam keywords`;
              }
            }

            // Check text không có dấu câu/dấu thanh (không tự nhiên cho tiếng Việt)
            // NOTE: Bỏ qua vì tiếng Việt có thể không có dấu
          }
        }

        const finalText = is_valid ? rawTranscription.trim() : '';

        console.log(`[Whisper API] ${is_valid ? '✅ ACCEPTED' : '❌ REJECTED'}: ${reason}`);

        resolve(NextResponse.json({
          text: finalText,
          userName: userName || 'Unknown',
          userId: userId || 'unknown',
          is_valid: is_valid,
          reason: reason,
          duration: durationSeconds,
          confidence: 0.85,
        }));
      });

      whisper.on('error', (err) => {
        try { fs.unlinkSync(wavFilePath); } catch (e) {}
        resolve(NextResponse.json(
          { error: 'Failed to spawn whisper', details: err.message },
          { status: 500 }
        ));
      });
    });

  } catch (error) {
    console.error('[Whisper API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}
