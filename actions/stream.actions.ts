'use server';

import { StreamClient } from '@stream-io/node-sdk';
import { StreamChat } from 'stream-chat';

const API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY!;
const API_SECRET = process.env.STREAM_SECRET_KEY!;

// ─── Video ──────────────────────────────────────────────────────

/** Video call token — uses @stream-io/node-sdk. */
export const tokenProvider = async (userId: string) => {
  if (!userId) throw new Error('Missing userId');
  const client = new StreamClient(API_KEY, API_SECRET);
  return client.createToken(userId);
};

/** Delete a video call from Stream. */
export async function deleteMeeting(meetingId: string, userId: string) {
  if (!meetingId) return { success: false, message: 'Missing meetingId' };
  if (!userId) return { success: false, message: 'Missing userId' };

  try {
    const client = new StreamClient(API_KEY, API_SECRET);
    await client.video.call('default', meetingId).delete();
    console.log(`✅ [DeleteMeeting] Deleted meeting: ${meetingId}`);
    return { success: true };
  } catch (error) {
    console.error('❌ [DeleteMeeting] Failed:', error);
    return { success: false, message: 'Không thể xóa cuộc họp' };
  }
}

/**
 * Ensure personal room exists with proper settings.
 * - Link is always fixed (meetingId = userId)
 * - User becomes host automatically
 * - No time limit (starts_at far in future)
 */
export async function ensurePersonalRoom(userId: string) {
  if (!userId) return { success: false, message: 'Missing userId' };

  try {
    const client = new StreamClient(API_KEY, API_SECRET);
    const call = client.video.call('default', userId);

    // Check if call exists
    try {
      await call.get();
      console.log(`📋 [PersonalRoom] Call already exists for user: ${userId}`);
      return { success: true, meetingId: userId };
    } catch {
      // Call doesn't exist, create it
    }

    // Create personal room with settings:
    // - starts_at: far in future (effectively permanent, no time limit)
    // - created_by_id: userId (user becomes host automatically)
    const startsAt = new Date('2099-01-01T00:00:00.000Z');

    await call.getOrCreate({
      data: {
        starts_at: startsAt,
        created_by_id: userId,
      },
    });

    console.log(`✅ [PersonalRoom] Created personal room for user: ${userId}`);
    return { success: true, meetingId: userId };
  } catch (error) {
    console.error('❌ [PersonalRoom] Failed:', error);
    return { success: false, message: 'Không thể tạo phòng cá nhân' };
  }
}

// ─── Chat ───────────────────────────────────────────────────────

const dicebearAvatar = (seed: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || 'User')}`;

/** Upsert a Stream Chat user and return their token.
 *  image: Clerk imageUrl — Dicebear initials if missing.
 *  ⚠️ Must use StreamChat client (not node-sdk) for Chat user store. */
export const generateChatToken = async (
  userId: string,
  name: string,
  image?: string | null,
) => {
  if (!userId) throw new Error('Missing userId');

  const displayName = (name || '').trim() || 'User';
  const imageUrl = (image?.trim() || dicebearAvatar(displayName)) as string;

  const serverClient = StreamChat.getInstance(API_KEY, API_SECRET);
  await serverClient.upsertUsers([
    { id: userId, name: displayName, image: imageUrl },
  ]);

  return serverClient.createToken(userId);
};

/** Upsert user without creating a token (used for background refresh). */
export const upsertStreamChatUser = async (
  userId: string,
  name: string,
  image?: string | null,
) => {
  if (!userId) throw new Error('Missing userId');

  let displayName = (name || '').trim() || 'User';
  if (displayName === userId) displayName = 'User';

  const imageUrl = (image?.trim() || dicebearAvatar(displayName)) as string;

  const serverClient = StreamChat.getInstance(API_KEY, API_SECRET);
  await serverClient.upsertUsers([
    { id: userId, name: displayName, image: imageUrl },
  ]);
};

/**
 * Get participant count for a personal room.
 * Returns the number of users currently in the call.
 */
export async function getPersonalRoomParticipants(userId: string) {
  if (!userId) return { success: false, count: 0 };

  try {
    const client = new StreamClient(API_KEY, API_SECRET);
    const call = client.video.call('default', userId);

    const response = await call.get();
    const sessionId = response.call.current_session_id;

    if (!sessionId) {
      console.log(`📊 [Participants] No active session for user: ${userId}`);
      return { success: true, count: 0, hasSession: false };
    }

    const participants = await call.listRecordings({ session_id: sessionId });
    console.log(`📊 [Participants] Found ${participants.recordings?.length ?? 0} recordings for user: ${userId}`);

    return {
      success: true,
      count: participants.recordings?.length ?? 0,
      hasSession: true,
    };
  } catch (error) {
    console.error('❌ [Participants] Failed:', error);
    return { success: false, count: 0 };
  }
}
export const ensureMeetingChatChannel = async (
  meetingId: string,
  memberIds: string[],
) => {
  if (!meetingId) throw new Error('Missing meetingId');

  const members = Array.from(new Set(memberIds.filter(Boolean)));
  if (!members.length) throw new Error('Missing channel members');

  const serverClient = StreamChat.getInstance(API_KEY, API_SECRET);

  const channelId = `meeting-${meetingId}`;
  const channel = serverClient.channel('messaging', channelId);

  try {
    const response = await channel.query();
    const existing = Object.keys(response.members ?? {});
    const missing = members.filter((id) => !existing.includes(id));
    if (missing.length) await channel.addMembers(missing);
  } catch {
    const newChannel = serverClient.channel('messaging', channelId, {
      members,
      created_by_id: members[0],
    });
    await newChannel.create();
  }
};
