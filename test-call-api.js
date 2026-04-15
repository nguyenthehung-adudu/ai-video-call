import fs from 'fs';
import { spawn } from 'child_process';
import http from 'http';

// Convert WebM to WAV (sử dụng ffmpeg)
async function convertToWavBuffer(audioBuffer) {
  return new Promise((resolve, reject) => {
    const args = [
      '-fflags', '+genpts+igndts',
      '-analyzeduration', '10M',
      '-probesize', '10M',
      '-err_detect', 'ignore_err',
      '-i', 'pipe:0',
      '-ar', '16000',
      '-ac', '1',
      '-acodec', 'pcm_s16le',
      '-f', 'wav',
      '-y',
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';
    let wavChunks = [];

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.stdout.on('data', (data) => {
      wavChunks.push(data);
    });

    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGTERM');
      reject(new Error('FFmpeg timeout'));
    }, 20000);

    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(0, 300)}`));
      } else {
        resolve(Buffer.concat(wavChunks));
      }
    });

    ffmpeg.on('error', (err) => reject(err));
    ffmpeg.stdin.write(audioBuffer);
    ffmpeg.stdin.end();
  });
}

// Gọi API
function callWhisperAPI(wavBuffer, userId, userName) {
  return new Promise((resolve) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const body = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="userId"\r\n\r\n`,
      `${userId}\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="userName"\r\n\r\n`,
      `${userName}\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n`,
      'Content-Type: audio/wav\r\n\r\n',
      wavBuffer,
      `\r\n--${boundary}--\r\n`,
    ].reduce((acc, part) => acc + (typeof part === 'string' ? part : part.toString('binary')), '');

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/whisper',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data: JSON.parse(data) });
      });
    });

    req.on('error', (err) => {
      resolve({ status: -1, data: { error: err.message } });
    });

    req.write(body);
    req.end();
  });
}

async function test() {
  const buffer = fs.readFileSync('temp/test-opus.webm');
  console.log('Input:', buffer.length, 'bytes');

  try {
    console.log('Converting to WAV...');
    const wavBuffer = await convertToWavBuffer(buffer);
    console.log('WAV:', wavBuffer.length, 'bytes');

    console.log('Calling API...');
    const result = await callWhisperAPI(wavBuffer, 'test-user', 'Test User');
    console.log('API Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));

  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

test();
