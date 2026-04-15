import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const WHISPER_EXE_PATH =
  "E:\\appsieucap\\AI\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe";

// Dùng model medium với quantization (cân bằng tốc độ & accuracy)
// Options: ggml-medium.bin (1.5GB), ggml-medium-q5_0.bin (800MB, nhanh hơn), ggml-medium-q8_0.bin (1.2GB)
const WHISPER_MODEL_PATH =
  "E:\\appsieucap\\AI\\whisper.cpp\\models\\ggml-medium-q5_0.bin";

// Execution queue - whisper must run ONE at a time
let whisperQueue = Promise.resolve();
let lastRunTime = 0;
const MIN_INTERVAL_MS = 1000; // 1 second between calls (reduced from 2s for lower latency)
const MAX_QUEUE_DEPTH = 3;

// Stats for monitoring
let stats = {
  totalCalls: 0,
  successCalls: 0,
  crashCalls: 0,
  skipCalls: 0,
};

async function ensureValidAudio(inputPath) {
  const fileStats = fs.statSync(inputPath);
  const fileSize = fileStats.size;
  const duration = fileSize / (16000 * 2); // Approximate duration for 16-bit mono

  console.log("[Whisper] File size:", fileSize, "bytes, estimated duration:", duration.toFixed(2), "s");

  // Skip if too short
  if (duration < 1.0) {
    console.log("[Whisper] Skipping: audio too short (<1s)");
    return null;
  }

  if (fileSize < 8000) {
    console.log("[Whisper] Skipping: file too small");
    return null;
  }

  const tempDir = os.tmpdir();
  const outputPath = path.join(tempDir, `whisper-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.wav`);

  return new Promise((resolve) => {
    console.log("[Whisper] Converting audio with ffmpeg...");

    const ffmpeg = spawn("ffmpeg", [
      "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-acodec", "pcm_s16le",
      "-y",
      outputPath,
    ], {
      windowsHide: true,
    });

    const timeout = setTimeout(() => {
      ffmpeg.kill();
      console.warn("[Whisper] ffmpeg timeout");
      resolve(null);
    }, 5000);

    ffmpeg.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        console.warn("[Whisper] ffmpeg failed with code:", code);
        resolve(null);
        return;
      }

      try {
        const outStats = fs.statSync(outputPath);
        if (!outStats || outStats.size < 8000) {
          console.warn("[Whisper] Converted file too small");
          try { fs.unlinkSync(outputPath); } catch (e) {}
          resolve(null);
          return;
        }
      } catch (e) {
        console.warn("[Whisper] Cannot stat converted file");
        resolve(null);
        return;
      }

      console.log("[Whisper] Conversion complete, output size:", fs.statSync(outputPath).size, "bytes");
      resolve(outputPath);
    });

    ffmpeg.on("error", (err) => {
      clearTimeout(timeout);
      console.error("[Whisper] ffmpeg error:", err.message);
      resolve(null);
    });
  });
}

async function runWhisperInternal(filePath) {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const absoluteFilePath = path.resolve(filePath);
    const workDir = path.dirname(absoluteFilePath);

    console.log("[Whisper] === Starting whisper ===");
    console.log("[Whisper] Exe:", WHISPER_EXE_PATH);
    console.log("[Whisper] Input:", absoluteFilePath);

    try {
      const fileSize = fs.statSync(absoluteFilePath).size;
      console.log("[Whisper] File size:", fileSize, "bytes");
    } catch (e) {
      console.error("[Whisper] Cannot read file");
      resolve("");
      return;
    }

    // Optimized CLI args - GPU accelerated with medium-q5_0 model
    // GPU enabled by default, explicitly select device 0
    const args = [
      "-m", WHISPER_MODEL_PATH,
      "-f", absoluteFilePath,
      "-l", "vi",
      "-t", "4",           // 4 threads on CPU (GPU handles most work)
      "-bs", "8",         // Beam size
      "-bo", "3",         // Best-of 3
      "-dev", "0",        // GPU device 0 (first GPU)
      "-ac", "0",         // Audio context: 0 = all (full context)
    ];

    console.log("[Whisper] Running in GPU mode (CUDA)");

    console.log("[Whisper] Args:", args.join(" "));

    console.log("[Whisper] Spawning process...");
    console.log("[Whisper] Full command:", WHISPER_EXE_PATH, args.join(" "));

    const whisperProcess = spawn(WHISPER_EXE_PATH, args, {
      cwd: workDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true, // Use shell on Windows
      env: {
        ...process.env,
        // GPU acceleration (CUDA)
        CUDA_VISIBLE_DEVICES: "0",  // Use first GPU; để "0,1" nếu dùng cả 2
        GGML_CUDA: "true",
        // Optimizations
        CUDA_LAUNCH_BLOCKING: "0",
      },
    });

    console.log("[Whisper] Process spawned with PID:", whisperProcess.pid);

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      console.warn("[Whisper] Timeout - killing process");
      try {
        whisperProcess.kill();
      } catch (e) {}
    }, 30000);

    whisperProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    whisperProcess.stderr.on("data", (data) => {
      const text = data.toString();
      if (text.toLowerCase().includes("error")) {
        stderr += text;
      }
    });

    whisperProcess.on("close", (code) => {
      clearTimeout(timeout);
      const elapsed = Date.now() - startTime;

      console.log("[Whisper] Exit code:", code, "| Time:", elapsed, "ms");

      if (code === 3221225781 || code === -1073741819) {
        stats.crashCalls++;
        console.error("[Whisper] CRASH (access violation) #" + stats.crashCalls);
        if (stderr) console.error("[Whisper] Stderr:", stderr.substring(0, 300));
      }

      if (code !== 0) {
        console.error("[Whisper] Non-zero exit, cleaning up");
        setTimeout(() => {
          try { if (fs.existsSync(absoluteFilePath)) fs.unlinkSync(absoluteFilePath); } catch (e) {}
        }, 500);
        resolve("");
        return;
      }

      // Parse output
      const lines = stdout.split("\n");
      let transcription = "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes("-->")) {
          const match = trimmed.match(/\]\s*(.+)$/);
          if (match && match[1]) {
            transcription += match[1].trim() + " ";
          }
        }
      }

      transcription = transcription.trim();

      if (!transcription) {
        console.log("[Whisper] No transcription text");
        console.log("[Whisper] Raw:", stdout.substring(0, 200));
        setTimeout(() => {
          try { if (fs.existsSync(absoluteFilePath)) fs.unlinkSync(absoluteFilePath); } catch (e) {}
        }, 500);
        resolve("");
        return;
      }

      stats.successCalls++;
      console.log("[Whisper] Result:", transcription.substring(0, 80), "| Time:", elapsed, "ms");
      setTimeout(() => {
        try { if (fs.existsSync(absoluteFilePath)) fs.unlinkSync(absoluteFilePath); } catch (e) {}
      }, 500);
      resolve(transcription);
    });

    whisperProcess.on("error", (err) => {
      clearTimeout(timeout);
      console.error("[Whisper] Spawn error:", err.message);
      setTimeout(() => {
        try { if (fs.existsSync(absoluteFilePath)) fs.unlinkSync(absoluteFilePath); } catch (e) {}
      }, 500);
      resolve("");
    });
  });
}

// Queue execution
function enqueue(task) {
  whisperQueue = whisperQueue.then(async () => {
    stats.totalCalls++;
    return await task();
  }).catch((err) => {
    console.error("[Whisper] Queue task error:", err.message);
    return "";
  });
  return whisperQueue;
}

export async function runWhisper(filePath) {
  // Check queue depth
  if (stats.totalCalls - stats.skipCalls - stats.successCalls - stats.crashCalls > MAX_QUEUE_DEPTH) {
    console.log("[Whisper] Queue too deep, skipping");
    stats.skipCalls++;
    return "";
  }

  // Cooldown check
  const now = Date.now();
  if (now - lastRunTime < MIN_INTERVAL_MS) {
    console.log("[Whisper] Cooldown active, skipping");
    stats.skipCalls++;
    return "";
  }

  // Validate paths with detailed logging
  console.log("[Whisper] Validating paths...");
  console.log("[Whisper] WHISPER_EXE_PATH:", WHISPER_EXE_PATH);
  console.log("[Whisper] WHISPER_MODEL_PATH:", WHISPER_MODEL_PATH);

  const exeExists = fs.existsSync(WHISPER_EXE_PATH);
  console.log("[Whisper] Exe exists:", exeExists);

  if (!exeExists) {
    console.error("[Whisper] EXE NOT FOUND at:", WHISPER_EXE_PATH);
    // Try to list directory to help debug
    try {
      const dir = path.dirname(WHISPER_EXE_PATH);
      console.log("[Whisper] Directory contents:", fs.readdirSync(dir));
    } catch (e) {
      console.error("[Whisper] Cannot read directory:", e.message);
    }
    return "";
  }

  const modelExists = fs.existsSync(WHISPER_MODEL_PATH);
  console.log("[Whisper] Model exists:", modelExists);

  if (!modelExists) {
    console.error("[Whisper] MODEL NOT FOUND at:", WHISPER_MODEL_PATH);
    return "";
  }

  const audioExists = fs.existsSync(filePath);
  console.log("[Whisper] Audio file exists:", audioExists);

  if (!audioExists) {
    console.error("[Whisper] Audio file not found:", filePath);
    return "";
  }

  let tempFile = null;

  const task = async () => {
    try {
      // Convert audio
      const validatedPath = await ensureValidAudio(filePath);
      if (!validatedPath) {
        return "";
      }
      tempFile = validatedPath;
      lastRunTime = Date.now();

      // Run whisper
      const result = await runWhisperInternal(validatedPath);
      return result;
    } catch (err) {
      console.error("[Whisper] Task error:", err.message);
      return "";
    } finally {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch (e) {}
      }
    }
  };

  return enqueue(task);
}

// Debug endpoint
export function getWhisperStats() {
  return { ...stats };
}