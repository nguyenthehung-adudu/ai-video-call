'use client';

import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { StreamChat } from 'stream-chat';
import { Chat } from 'stream-chat-react';

const API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY!;

type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';

function clampName(u: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
}) {
  const full = u.fullName?.trim();
  if (full) return full;
  const parts = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  if (parts) return parts;
  return u.username?.trim() || u.primaryEmailAddress?.emailAddress || 'User';
}

function getAvatarImage(
  u: Parameters<typeof clampName>[0] & { imageUrl?: string | null } | null,
): string | undefined {
  if (!u) return undefined;
  const img = u.imageUrl?.trim();
  if (img) return img;
  const name = clampName(u);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0E78F9&color=fff&size=128`;
}

// Module-level singleton
let _client: StreamChat | null = null;
let _connectedUid: string | null = null;
let _manager: ChatConnectionManager | null = null;

class ChatConnectionManager {
  status: ConnStatus = 'idle';
  client: StreamChat | null = null;
  error: string | null = null;

  private _listeners = new Set<(s: ConnStatus, e: string | null) => void>();

  subscribe(fn: (s: ConnStatus, e: string | null) => void) {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  private _notify(s: ConnStatus, e: string | null) {
    console.log('📡 [ChatManager] Status change:', { status: s, error: e });
    this._listeners.forEach((fn) => fn(s, e));
  }

  async connect(uid: string, displayName: string, image?: string) {
    // Only check status, not stale client
    if (this.status === 'connected' && _connectedUid === uid) {
      console.log('🛑 [ChatManager] Already connected', { uid });
      return;
    }

    if (this.status === 'connecting') {
      console.log('⏳ [ChatManager] Already connecting');
      return;
    }

    console.log('🚀 [ChatManager] connect() START', { uid });

    this.status = 'connecting';
    this.error = null;
    this._notify(this.status, null);

    try {
      // Create client only once
      if (!_client) {
        console.log('🧠 [ChatManager] Creating StreamChat instance');
        _client = StreamChat.getInstance(API_KEY);
        _client.on('connection.changed', (event) => {
          console.log(`🌐 [Chat] Connection: ${event.online ? 'ONLINE' : 'OFFLINE'}`);
        });
      }

      // Skip if already connected (double check)
      if (_connectedUid === uid && _client.userID === uid) {
        console.log('✅ [ChatManager] Already connected, skip');
        this.status = 'connected';
        this.client = _client;
        this._notify(this.status, null);
        return;
      }

      // Disconnect old user
      if (_connectedUid && _connectedUid !== uid) {
        console.log('👋 [ChatManager] Disconnecting old user');
        try { await _client.disconnectUser(); } catch {}
        _connectedUid = null;
      }

      // Connect with tokenProvider
      console.log('🔑 [ChatManager] Connecting user:', uid);
      await _client.connectUser(
        { id: uid, name: displayName, image },
        async () => {
          console.log('🔥 [ChatManager] Token fetch START', { uid });
          const tokenStart = Date.now();

          const res = await fetch('/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid, name: displayName, image, type: 'chat' }),
          });

          console.log('🔥 [ChatManager] Token response:', {
            status: res.status,
            time: Date.now() - tokenStart + 'ms',
          });

          if (!res.ok) throw new Error('Failed to fetch token');
          const data = await res.json();
          console.log('✅ [ChatManager] Token OK', { time: Date.now() - tokenStart + 'ms' });
          return data.token;
        },
      );

      _connectedUid = uid;
      this.client = _client;
      this.status = 'connected';
      console.log('✅ [ChatManager] Connected successfully');
      this._notify(this.status, null);
    } catch (err) {
      console.error('❌ [ChatManager] Error:', err);

      // Clear broken state
      this.client = null;
      _client = null;
      _connectedUid = null;

      this.status = 'error';
      this.error = err instanceof Error ? err.message : 'Chat connection failed';
      this._notify(this.status, this.error);
    }
  }

  disconnect() {
    console.log('👋 [ChatManager] FORCE disconnect');

    // Disconnect user
    try {
      this.client?.disconnectUser?.();
    } catch {}

    // Reset all state
    this.client = null;
    this.status = 'idle';
    this.error = null;

    // RESET GLOBAL STATE
    _client = null;
    _connectedUid = null;

    this._notify(this.status, null);
  }
}

function getChatManager() {
  if (!_manager) _manager = new ChatConnectionManager();
  return _manager;
}

// ─────────────────────────────────────────────────────────────────────────────

const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoaded } = useUser();
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<StreamChat | null>(null);

  const uidRef = useRef<string | null>(null);
  const displayNameRef = useRef<string>('');
  const imageRef = useRef<string | undefined>(undefined);
  const lastReconnectRef = useRef(0);
  const managerRef = useRef(getChatManager());
  const mountedRef = useRef(true);

  // Subscribe to manager (runs once)
  useEffect(() => {
    console.log('🟢 [ChatProvider] Mounted');
    mountedRef.current = true;

    const manager = managerRef.current;

    const unsub = manager.subscribe((s, e) => {
      if (!mountedRef.current) return;
      console.log('📊 [ChatProvider] Manager callback:', {
        status: s,
        error: e,
        hasClient: !!manager.client,
      });

      setStatus(s);
      setError(e);
      setClient(manager.client);
    });
    setStatus(manager.status);
    setError(manager.error);
    setClient(manager.client);

    return () => {
      console.log('🔴 [ChatProvider] Unmounted');
      mountedRef.current = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Init on Clerk load (runs once when user is available)
  useEffect(() => {
    if (!isLoaded) return;

    const uid = user?.id ?? null;
    if (!uid) {
      uidRef.current = null;
      // Don't disconnect on uid change - just ignore
      return;
    }

    const name = clampName(user!);
    const image = getAvatarImage(user);

    uidRef.current = uid;
    displayNameRef.current = name;
    imageRef.current = image;

    console.log('🚀 [ChatProvider] Starting connection:', { uid });
    void managerRef.current.connect(uid, name, image);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user?.id]);

  // Visibility: reconnect with spam prevention
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;

      // Skip if already connected
      if (managerRef.current.status === 'connected') {
        console.log('🛑 [ChatProvider] Skip reconnect (already connected)');
        return;
      }

      const uid = uidRef.current;
      if (!uid) return;

      // Spam prevention: wait 5 seconds between reconnects
      const now = Date.now();
      if (now - lastReconnectRef.current < 5000) {
        console.log('⏳ [ChatProvider] Skipping reconnect (too soon)');
        return;
      }
      lastReconnectRef.current = now;

      console.log('👁️ [ChatProvider] Tab visible, reconnecting');
      await managerRef.current.connect(uid, displayNameRef.current, imageRef.current);
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry handler - NO disconnect during retry
  const handleRetry = useCallback(() => {
    const uid = uidRef.current;
    if (!uid) return;

    console.log('🔁 [ChatProvider] Retry clicked', { uid, status });

    managerRef.current.connect(
      uid,
      displayNameRef.current,
      imageRef.current
    );
  }, [status]);

  const isConnecting = status !== 'connected' || !client;

  // Render - NEVER conditionally unmount children, use overlay instead
  return (
    <>
      {/* Always render Chat wrapper - never unmount children based on loading */}
      {client ? (
        <Chat client={client}>
          {children}
        </Chat>
      ) : (
        <>{children}</>
      )}

      {/* Overlay for loading/connecting state - use if user is loaded but chat is not */}
      {isLoaded && isConnecting && (
        <div className="fixed inset-0 bg-dark-2/90 z-[40] flex flex-col items-center justify-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          {status === 'error' ? (
            <div className="flex flex-col items-center gap-4 text-red-400 text-center px-4">
              <p>{error ?? 'Chat connection error'}</p>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <p className="text-white/70">Đang kết nối chat...</p>
          )}
        </div>
      )}
    </>
  );
};

export default ChatProvider;