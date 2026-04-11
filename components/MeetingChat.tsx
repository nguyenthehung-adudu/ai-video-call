'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatContext } from 'stream-chat-react';
import { useUser } from '@clerk/nextjs';
import { X, Send } from 'lucide-react';
import type { MessageResponse } from 'stream-chat';

interface Props {
  meetingId: string;
  onClose?: () => void;
}

interface Message {
  id: string;
  text: string;
  user: {
    id: string;
    name?: string;
  };
  createdAt: string;
}

type StreamChannel = ReturnType<typeof import('stream-chat').StreamChat.prototype.channel>;

const MeetingChat = React.memo(({ meetingId, onClose }: Props) => {
  const { client } = useChatContext();
  const { user } = useUser();

  // Render counter for infinite loop detection
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  // Debug: Track client stability
  const prevClientRef = useRef(client);
  if (prevClientRef.current !== client) {
    console.log('⚠️ [MeetingChat] CLIENT CHANGED:', {
      old: prevClientRef.current,
      new: client,
    });
  }
  prevClientRef.current = client;

  console.log('🔵 [MeetingChat] Render:', {
    renderCount: renderCountRef.current,
    meetingId,
    hasClient: !!client,
    hasUser: !!user,
  });

  // Track mount/unmount
  useEffect(() => {
    console.log('🟢 [MeetingChat] Mounted');
    return () => console.log('💀 [MeetingChat] Unmounted');
  }, []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasInitRef = useRef(false);
  const currentMeetingIdRef = useRef(meetingId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sentMessageIdsRef = useRef(new Set<string>());
  const loadedRef = useRef(false);

  // Refs for async operations
  const clientRef = useRef(client);
  const userRef = useRef(user);
  const isMountedRef = useRef(true);

  clientRef.current = client;
  userRef.current = user;

  // Track mount/unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Scroll to bottom ────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const channelId = React.useMemo(() => `meeting-${meetingId}`, [meetingId]);

  // ── Memoized channel ──────────────────────────────────────────────────────
  const channel = React.useMemo(() => {
    const currentClient = clientRef.current;
    const currentUser = userRef.current;
    if (!currentClient || !currentUser?.id) {
      console.log('💬 [MeetingChat] Channel is NULL:', {
        hasClient: !!currentClient,
        hasUser: !!currentUser,
        channelId,
      });
      return null;
    }

    console.log('💬 [MeetingChat] Creating channel:', {
      channelId,
      clientType: currentClient.constructor.name,
    });

    return currentClient.channel('messaging', channelId, {
      members: [currentUser.id],
    });
  }, [client, user, channelId]);

  // ── Load messages once when channel.id is ready ──────────────────────────
  useEffect(() => {
    const ch = channel;
    const channelId = ch?.id;
    const currentUser = userRef.current;

    if (!channelId || !currentUser?.id) {
      console.log('⏳ [MeetingChat] Skipping load: no channel id or user');
      return;
    }

    // Reset loaded flag if channel changed
    if (currentMeetingIdRef.current !== meetingId) {
      console.log('🔄 [MeetingChat] Channel changed, resetting loadedRef');
      currentMeetingIdRef.current = meetingId;
      loadedRef.current = false;
    }

    // Prevent multiple loads
    if (loadedRef.current) {
      console.log('✅ [MeetingChat] Already loaded, skipping');
      return;
    }

    loadedRef.current = true;

    console.log('📥 [MeetingChat] Loading messages for channel:', channelId);

    const loadMessages = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log('🔍 [MeetingChat] Querying channel messages...');
        const response = await ch!.query({
          messages: { limit: 50 },
        });

        if (!isMountedRef.current) return;

        const existingMessages: Message[] = (response.messages || []).map((msg: MessageResponse) => ({
          id: msg.id,
          text: msg.text || '',
          user: {
            id: msg.user?.id || '',
            name: msg.user?.name,
          },
          createdAt: msg.created_at || new Date().toISOString(),
        }));

        existingMessages.forEach(msg => sentMessageIdsRef.current.add(msg.id));

        setMessages(existingMessages);
        console.log(`✅ [MeetingChat] Loaded ${existingMessages.length} messages`);

        await ch!.addMembers([currentUser.id]).catch(() => {});
        await ch!.watch();

        console.log('✅ [MeetingChat] Channel ready:', channelId);
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error('❌ [MeetingChat] Channel error:', err);
        setError(err instanceof Error ? err.message : 'Chat unavailable');
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    loadMessages();
  }, [channel?.id]); // Use channel.id, not channel object

  // ── Listen for new messages (only from OTHER users) ─────────────────────
  useEffect(() => {
    const ch = channel;
    if (!ch) {
      console.log('⏳ [MeetingChat] Skipping listener setup (no channel)');
      return;
    }

    const channelId = ch.id;
    console.log('👁️ [MeetingChat] Setting up message listener for:', channelId);

    const handleNewMessage = (event: { message?: MessageResponse }) => {
      const msg = event.message;
      if (!msg) return;

      const currentUser = userRef.current;

      console.log('📩 [MeetingChat] Message event:', {
        id: msg.id,
        text: msg.text,
        userId: msg.user?.id,
        isOwn: msg.user?.id === currentUser?.id,
      });

      if (msg.user?.id === currentUser?.id) {
        console.log('⚠️ [MeetingChat] Skipping own message:', msg.id);
        return;
      }

      if (sentMessageIdsRef.current.has(msg.id)) {
        console.log('⚠️ [MeetingChat] Duplicate skipped:', msg.id);
        return;
      }

      console.log('📨 [MeetingChat] New message received:', msg.id);

      const newMsg: Message = {
        id: msg.id,
        text: msg.text || '',
        user: {
          id: msg.user?.id || '',
          name: msg.user?.name,
        },
        createdAt: msg.created_at || new Date().toISOString(),
      };

      sentMessageIdsRef.current.add(msg.id);
      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    };

    ch.on('message.new', handleNewMessage as never);

    return () => {
      console.log('🔴 [MeetingChat] Removing message listener for:', channelId);
      ch.off('message.new', handleNewMessage as never);
    };
  }, [channel?.id]); // Use channel.id, not channel object

  // ── Send message (NO optimistic UI - wait for server response) ──────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    const ch = channel;
    const currentUser = userRef.current;

    if (!text || !ch) {
      console.log('⛔ [MeetingChat] Cannot send: empty or no channel');
      return;
    }

    console.log('📤 [MeetingChat] Sending message:', text);

    setInput('');

    try {
      const result = await ch.sendMessage({ text });

      const sentMsg = result.message;
      if (!sentMsg) {
        console.error('❌ [MeetingChat] No message in response');
        return;
      }

      sentMessageIdsRef.current.add(sentMsg.id);

      const newMsg: Message = {
        id: sentMsg.id,
        text: sentMsg.text || '',
        user: {
          id: sentMsg.user?.id || currentUser?.id || '',
          name: sentMsg.user?.name || currentUser?.fullName || currentUser?.username || 'User',
        },
        createdAt: sentMsg.created_at || new Date().toISOString(),
      };

      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      console.log('✅ [MeetingChat] Message sent:', sentMsg.id);
    } catch (err) {
      console.error('❌ [MeetingChat] Send error:', err);
      setInput(text);
    }
  }, [input, channel]);

  // ── Render ──────────────────────────────────────────────────────────────
  console.log('🎨 [MeetingChat] Render:', {
    isLoading,
    error: !!error,
    hasChannel: !!channel,
    messageCount: messages.length,
  });

  return (
    <div className="flex flex-col h-full w-full bg-dark-1 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-3 flex-shrink-0">
        <h2 className="font-semibold text-white text-base">💬 Tin nhắn</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-dark-3 text-white/60 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* ── Messages ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sky-2">
            Đang tải tin nhắn...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
            <p>❌ {error}</p>
            <button
              type="button"
              className="text-sm text-blue-400 underline"
              onClick={() => {
                hasInitRef.current = false;
                sentMessageIdsRef.current.clear();
                setMessages([]);
                setIsLoading(true);
                setError(null);
              }}
            >
              Thử lại
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/40">
            Chưa có tin nhắn nào
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.user.id === user?.id ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-white/60">
                  {msg.user.id === user?.id ? 'Bạn' : msg.user.name || 'User'}
                </span>
                <span className="text-xs text-white/40">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.user.id === user?.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-dark-3 text-white/90'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ──────────────────────────────────────────────────────── */}
      {!error && (
        <div className="flex-shrink-0 border-t border-dark-3 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nhập tin nhắn..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              className="flex-1 bg-dark-3 text-white text-sm rounded-lg px-4 py-2 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

MeetingChat.displayName = 'MeetingChat';

export default MeetingChat;
