import { NextRequest, NextResponse } from 'next/server';

/**
 * API lấy cấu hình dịch vụ dịch
 * Trả về dịch vụ đang dùng và trạng thái API keys
 */

export async function GET() {
  try {
    const service = process.env.TRANSLATE_SERVICE || 'mymemory';
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasDeepLKey = !!process.env.DEEPL_API_KEY;

    return NextResponse.json({
      success: true,
      service,
      services: {
        mymemory: true, // Always available
        openai: hasOpenAIKey,
        deepl: hasDeepLKey,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get config' },
      { status: 500 }
    );
  }
}
