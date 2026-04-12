import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getInvitationsByEmail, dismissInvitation } from '@/actions/invite.actions';

// GET /api/invitations?email=xxx
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const result = await getInvitationsByEmail(email);

    if (result.success) {
      return NextResponse.json({
        invitations: result.invitations.map((inv) => ({
          id: inv.id,
          callId: inv.meetingId,
          meetingName: inv.meetingName,
          hostName: inv.hostName,
          hostId: inv.hostId,
          type: inv.type,
          scheduledAt: inv.scheduledAt instanceof Date
            ? inv.scheduledAt.toISOString()
            : inv.scheduledAt,
          createdAt: inv.createdAt instanceof Date
            ? inv.createdAt.toISOString()
            : inv.createdAt,
        }))
      });
    }

    return NextResponse.json(
      { error: result.message || 'Failed to fetch invitations' },
      { status: 500 }
    );
  } catch (error) {
    console.error('❌ [API /invitations GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
}

// POST /api/invitations/dismiss
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 });
    }

    const result = await dismissInvitation(id);

    if (result.success) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: result.message || 'Failed to dismiss invitation' },
      { status: 500 }
    );
  } catch (error) {
    console.error('❌ [API /invitations POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss invitation' },
      { status: 500 }
    );
  }
}
