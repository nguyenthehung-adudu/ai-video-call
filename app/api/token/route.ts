import { NextResponse } from 'next/server';
import { generateChatToken, tokenProvider } from '@/actions/stream.actions';

export async function GET() {
  try {
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Token endpoint check' }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, name, image, type } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // For VIDEO tokens (default), use tokenProvider from stream.actions
    // For CHAT tokens, use generateChatToken
    let token: string;
    if (type === 'chat') {
      token = await generateChatToken(userId, name || 'User', image);
    } else {
      // Video token - use the node-sdk based function
      console.log('🔑 [API /token] Generating VIDEO token for:', userId);
      token = await tokenProvider(userId);
      console.log('🔑 [API /token] Video token generated, length:', token.length);
    }

    return NextResponse.json({ token });
  } catch (error) {
    console.error('[API /token] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}
