import { runWhisper } from "./ai/whisper.js";

async function main() {
  console.log("🚀 START");

  try {
    const result = await runWhisper("E:\\appsieucap\\AI\\whisper.cpp\\test.wav");
    console.log("👉 RESULT:", result);
  } catch (err) {
    console.error("❌ ERROR:", err.message);
  }

  console.log("✅ DONE");
}

main();