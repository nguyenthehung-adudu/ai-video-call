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

/** Ensure a chat channel exists for the meeting, adding missing members. */
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
