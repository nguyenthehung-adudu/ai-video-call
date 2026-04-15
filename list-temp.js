import fs from 'fs';
import path from 'path';

// Tạo WAV file với speech synthesized (sử dụng ffmpeg để tạo audio có speech)
// Thực tế nên test với file có thật từ MediaRecorder

console.log('Test files in temp folder:');
const tempDir = path.join(process.cwd(), 'temp');
const files = fs.readdirSync(tempDir);
for (const file of files) {
  const stats = fs.statSync(path.join(tempDir, file));
  console.log(`  ${file}: ${stats.size} bytes`);
}

// In ra file mới nhất
const wavFiles = files.filter(f => f.endsWith('.wav')).sort();
console.log('\nWAV files:', wavFiles);
