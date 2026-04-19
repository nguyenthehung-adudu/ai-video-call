import { NextRequest, NextResponse } from 'next/server';

/**
 * API dịch thuật
 * Hỗ trợ nhiều dịch vụ:
 * - MyMemory (miễn phí, giới hạn)
 * - OpenAI (có API key)
 * - DeepL (có API key)
 *
 * Cấu hình qua environment variables:
 * - TRANSLATE_SERVICE: 'mymemory' | 'openai' | 'deepl'
 * - OPENAI_API_KEY: (nếu dùng OpenAI)
 * - DEEPL_API_KEY: (nếu dùng DeepL)
 */

const TRANSLATE_SERVICE = process.env.TRANSLATE_SERVICE || 'mymemory';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

interface TranslateRequest {
  text: string;
  sourceLang?: string; // e.g. 'vi', 'zh', 'ja'
  targetLang?: string; // e.g. 'en'
  service?: 'mymemory' | 'openai' | 'deepl'; // Dịch vụ dịch (từ settings)
}

/**
 * Dịch bằng MyMemory API (miễn phí)
 */
async function translateWithMyMemory(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`MyMemory API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.responseStatus !== 200) {
    throw new Error(data.responseDetails || 'Translation failed');
  }

  return data.responseData.translatedText;
}

/**
 * Dịch bằng OpenAI GPT
 */
async function translateWithOpenAI(text: string, sourceLang: string, targetLang: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const langNames: Record<string, string> = {
    'vi': 'Vietnamese',
    'en': 'English',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
  };

  const sourceName = langNames[sourceLang] || sourceLang;
  const targetName = langNames[targetLang] || targetLang;

  const prompt = `Translate the following text from ${sourceName} to ${targetName}. Only output the translation, no explanations:\n\n${text}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Dịch bằng DeepL API
 */
async function translateWithDeepL(text: string, sourceLang: string, targetLang: string): Promise<string> {
  if (!DEEPL_API_KEY) {
    throw new Error('DeepL API key not configured');
  }

  // DeepL dùng mã ngôn ngữ khác: VI -> vi, EN -> EN, ZH -> zh, etc.
  const deeplSourceLang = sourceLang.toUpperCase() as 'VI' | 'EN' | 'ZH' | 'JA' | 'KO' | 'FR' | 'DE' | 'ES';
  const deeplTargetLang = targetLang.toUpperCase() as 'EN' | 'VI' | 'ZH' | 'JA' | 'KO' | 'FR' | 'DE' | 'ES';

  const response = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      text: text,
      source_lang: deeplSourceLang,
      target_lang: deeplTargetLang,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`DeepL API error: ${response.status}`);
  }

  const data = await response.json();
  return data.translations[0].text;
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Translate API] === Received request ===');

    const body: TranslateRequest = await request.json();
    const { text, sourceLang = 'vi', targetLang = 'en', service } = body;

    console.log('[Translate API] Translating:', {
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      from: sourceLang,
      to: targetLang,
      service: service || TRANSLATE_SERVICE,
    });

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Sử dụng dịch vụ từ request, nếu không có thì dùng từ env
    const usedService = service || TRANSLATE_SERVICE;
    let translatedText: string;

    switch (usedService) {
      case 'openai':
        translatedText = await translateWithOpenAI(text, sourceLang, targetLang);
        break;

      case 'deepl':
        translatedText = await translateWithDeepL(text, sourceLang, targetLang);
        break;

      case 'mymemory':
      default:
        translatedText = await translateWithMyMemory(text, sourceLang, targetLang);
        break;
    }

    console.log('[Translate API] ✅ Translation result:', translatedText.substring(0, 100));

    return NextResponse.json({
      success: true,
      original_text: text,
      translated_text: translatedText,
      source_lang: sourceLang,
      target_lang: targetLang,
    });

  } catch (error: any) {
    console.error('[Translate API] ❌ Error:', error.message);
    return NextResponse.json(
      {
        error: 'Translation failed',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
