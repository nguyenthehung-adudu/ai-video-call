import { NextResponse } from 'next/server';
import { ensureMeetingChatChannel } from '@/actions/stream.actions';

export async function POST(request: Request) {
  try {
    const { meetingId, memberId } = await request.json();

    if (!meetingId || !memberId) {
      return NextResponse.json(
        { error: 'Missing meetingId or memberId' },
        { status: 400 }
      );
    }

    console.log('📝 [API /chat/join] Adding member to channel:', {
      meetingId,
      memberId,
    });

    await ensureMeetingChatChannel(meetingId, [memberId]);

    console.log('✅ [API /chat/join] Member added successfully');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /chat/join] Error:', error);
    return NextResponse.json(
      { error: 'Failed to join chat channel' },
      { status: 500 }
    );
  }
}
