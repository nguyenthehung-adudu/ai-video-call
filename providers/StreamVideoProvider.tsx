'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  StreamVideo,
  StreamVideoClient,
} from '@stream-io/video-react-sdk';
import { useUser } from '@clerk/nextjs';
import { tokenProvider as tokenProviderAction } from '@/actions/stream.actions';

const API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY!;

/** Normalise Clerk name — never fall back to raw id. */
function clerkName(u: {
  id: string;
  fullName?: string | null;
  username?: string | null;
}): string {
  return u.fullName?.trim() || u.username?.trim() || u.id;
}

const StreamVideoProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoaded } = useUser();
  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(null);
  // Keep the latest user id so cleanup can see it
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    const uid = user?.id ?? null;
    userIdRef.current = uid;

    if (!uid) {
      setVideoClient(null);
      return;
    }

    let cancelled = false;

    const init = async () => {
      try {
        const displayName = clerkName(user!);
        const image = user!.imageUrl?.trim() || undefined;

        // getOrCreateInstance returns the SAME instance for the same apiKey+user
        const instance = StreamVideoClient.getOrCreateInstance({
          apiKey: API_KEY,
          user: {
            id: uid,
            name: displayName,
            image,
            type: 'authenticated',
          },
          tokenProvider: async () => {
            const token = await tokenProviderAction(uid);
            return token;
          },
        });

        if (!cancelled) {
          console.log('[StreamVideo] client ready', uid);
          setVideoClient(instance);
        }
      } catch (err) {
        console.error('❌ StreamVideoProvider init:', err);
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user?.id, user?.fullName, user?.username, user?.imageUrl]);

  if (!videoClient) {
    return (
      <div className="h-screen flex items-center justify-center text-white bg-dark-2">
        Loading video...
      </div>
    );
  }

  return <StreamVideo client={videoClient}>{children}</StreamVideo>;
};

export default StreamVideoProvider;
