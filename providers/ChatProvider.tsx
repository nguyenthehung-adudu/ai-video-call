'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { StreamChat } from 'stream-chat';
import { Chat } from 'stream-chat-react';
import { generateChatToken } from '@/actions/stream.actions';

const API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY!;

let chatClient: StreamChat | null = null;

function clerkName(u: {
  id: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
}): string {
  const full = u.fullName?.trim();
  if (full) return full;
  const parts = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  if (parts) return parts;
  return u.username?.trim() || u.primaryEmailAddress?.emailAddress || 'User';
}

const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoaded } = useUser();
  const [client, setClient] = useState<StreamChat | null>(null);
  const connectAttemptRef = useRef(0);

  useEffect(() => {
    if (!isLoaded) return;

    const uid = user?.id ?? null;
    if (!uid) {
      setClient(null);
      return;
    }

    let cancelled = false;
    const attempt = ++connectAttemptRef.current;

    const initChat = async () => {
      try {
        if (!chatClient) {
          chatClient = StreamChat.getInstance(API_KEY);
        }

        const displayName = clerkName(user!);
        const image = user!.imageUrl?.trim() || undefined;

        const token = await generateChatToken(uid, displayName, image);

        // Only connect if this is still the latest attempt (not stale after logout)
        if (cancelled || connectAttemptRef.current !== attempt) return;

        await chatClient.connectUser(
          { id: uid, name: displayName, image },
          token,
        );

        if (!cancelled) setClient(chatClient);
      } catch (err) {
        console.error('❌ ChatProvider:', err);
      }
    };

    void initChat();

    return () => {
      cancelled = true;
    };
  }, [
    isLoaded,
    user?.id,
    user?.fullName,
    user?.firstName,
    user?.lastName,
    user?.username,
    user?.imageUrl,
    user?.primaryEmailAddress?.emailAddress,
  ]);

  if (!isLoaded || !client) {
    return (
      <div className="text-white flex h-screen items-center justify-center">
        💬 {client ? 'Chat unavailable' : 'Connecting chat…'}
        {user?.id ? ` (${user.id})` : ''}
      </div>
    );
  }

  return <Chat client={client}>{children}</Chat>;
};

export default ChatProvider;
