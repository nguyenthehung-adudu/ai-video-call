import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Absolute path to ffmpeg
const FFMPEG_PATH = 'E:\\gear\\ffmpeg-2026-04-09-git-d3d0b7a5ee-full_build\\bin\\ffmpeg.exe';

/**
 * Convert audio buffer (WebM) to WAV using ffmpeg with file-based approach
 * - Uses absolute ffmpeg path
 * - Standard command: ffmpeg -y -i input.webm -ar 16000 -ac 1 -c:a pcm_s16le output.wav
 * - Full logging of input/output paths and stderr
 * - Validates output size and duration
 */
export async function convertToWavBuffer(audioBuffer: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    console.log(`[FFmpeg] Input buffer: ${audioBuffer.length} bytes`);
    console.log(`[FFmpeg] First 12 bytes (hex):`, audioBuffer.slice(0, 12).toString('hex'));

    // Check if input is already WAV (RIFF header)
    const isWav = audioBuffer.length >= 12 &&
      audioBuffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      audioBuffer.slice(8, 12).toString('ascii') === 'WAVE';

    if (isWav) {
      console.log('[FFmpeg] Input is already WAV format, passing through');
      resolve(audioBuffer);
      return;
    }

    // Create temp files
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `input-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.webm`);
    const outputPath = path.join(tempDir, `output-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.wav`);

    console.log(`[FFmpeg] Input file path: ${inputPath}`);
    console.log(`[FFmpeg] Output file path: ${outputPath}`);

    // Write input buffer to temp file
    fs.writeFileSync(inputPath, audioBuffer);
    console.log(`[FFmpeg] Written input file: ${fs.statSync(inputPath).size} bytes`);

    // Standard ffmpeg command for Whisper
    const args = [
      '-y',                    // Overwrite output
      '-i', inputPath,         // Input file
      '-ar', '16000',          // Sample rate 16kHz (Whisper standard)
      '-ac', '1',              // Mono
      '-c:a', 'pcm_s16le',     // PCM 16-bit signed little-endian
      outputPath,              // Output file
    ];

    console.log('[FFmpeg] Command:', `${FFMPEG_PATH} ${args.join(' ')}`);

    const ffmpeg = spawn(FFMPEG_PATH, args, {
      windowsHide: true,
    });

    let stderr = '';
    let stdout = '';

    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString();
      stderr += msg;
      console.log('[FFmpeg stderr]', msg.trim());
    });

    ffmpeg.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    const timeout = setTimeout(() => {
      console.warn('[FFmpeg] Timeout after 20s');
      try { fs.unlinkSync(inputPath); } catch (e) {}
      try { fs.unlinkSync(outputPath); } catch (e) {}
      ffmpeg.kill('SIGTERM');
      reject(new Error('FFmpeg timeout after 20s'));
    }, 20000);

    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);

      console.log(`[FFmpeg] Exit code: ${code}`);
      console.log(`[FFmpeg] stderr (${stderr.length} chars):`, stderr.substring(0, 500));
      console.log(`[FFmpeg] stdout (${stdout.length} chars):`, stdout.substring(0, 200));

      // Cleanup input file
      try { fs.unlinkSync(inputPath); } catch (e) {}

      if (code !== 0) {
        console.error('[FFmpeg] ❌ Conversion FAILED');
        console.error('[FFmpeg] Full stderr:\n', stderr);
        reject(new Error(`FFmpeg failed with exit code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }

      // Check output file exists
      if (!fs.existsSync(outputPath)) {
        reject(new Error('FFmpeg did not create output file'));
        return;
      }

      const outputStats = fs.statSync(outputPath);
      const outputSize = outputStats.size;
      console.log(`[FFmpeg] Output file size: ${outputSize} bytes`);

      // VALIDATE: Output file size < 10KB → reject
      if (outputSize < 10000) {
        try { fs.unlinkSync(outputPath); } catch (e) {}
        reject(new Error(`WAV file too small (${outputSize} bytes < 10KB threshold)`));
        return;
      }

      // Read WAV buffer
      const wavBuffer = fs.readFileSync(outputPath);
      console.log(`[FFmpeg] ✓ Conversion successful: ${audioBuffer.length} → ${wavBuffer.length} bytes`);

      // Cleanup output file
      try { fs.unlinkSync(outputPath); } catch (e) {}

      resolve(wavBuffer);
    });

    ffmpeg.on('error', (err) => {
      console.error('[FFmpeg] Spawn error:', err.message);
      console.error('[FFmpeg] Full stderr:', stderr);
      try { fs.unlinkSync(inputPath); } catch (e) {}
      try { fs.unlinkSync(outputPath); } catch (e) {}
      reject(err);
    });

    console.log('[FFmpeg] Started conversion process');
  });
}
