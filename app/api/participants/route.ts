import { NextResponse } from 'next/server';
import { StreamClient } from '@stream-io/node-sdk';

const API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY!;
const API_SECRET = process.env.STREAM_SECRET_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get('meetingId');

  if (!meetingId) {
    return NextResponse.json(
      { success: false, message: 'Missing meetingId' },
      { status: 400 }
    );
  }

  try {
    const client = new StreamClient(API_KEY, API_SECRET);
    const call = client.video.call('default', meetingId);

    const response = await call.get();
    const sessionId = response.call.current_session_id;

    if (!sessionId) {
      return NextResponse.json({
        success: true,
        count: 0,
        hasSession: false,
      });
    }

    // Get members count from call response
    const members = response.call.members || [];
    const memberCount = members.length;

    // Try to get call members from query
    let activeCount = memberCount;

    try {
      // Use get with members to get current participants
      const callData = await call.get({
        members: {
          limit: 100,
          joined: true,
        },
      });
      
      if (callData.call.members && callData.call.members.length > 0) {
        activeCount = callData.call.members.length;
      }
    } catch (e) {
      console.log('Members query not supported, using fallback');
    }

    return NextResponse.json({
      success: true,
      count: activeCount,
      hasSession: !!sessionId,
    });
  } catch (error) {
    console.error('❌ [API/Participants] Failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to get participants' },
      { status: 500 }
    );
  }
}
