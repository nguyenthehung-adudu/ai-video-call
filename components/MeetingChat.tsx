'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChatContext } from 'stream-chat-react';
import { useUser } from '@clerk/nextjs';
import {
  X,
  Send,
  Smile,
  Image as ImageIcon,
  Trash2,
  Reply,
  CornerDownRight,
  Edit3,
  Check,
} from 'lucide-react';
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
    image?: string;
  };
  createdAt: string;
  replyToId?: string;
  replyToText?: string;
  replyToUser?: string;
  isEdited?: boolean;
  attachments?: Array<{ type: string; image_url?: string }>;
}

const EMOJI_LIST = ['😀', '😂', '❤️', '👍', '🎉', '🔥', '👋', '🤔', '😅', '😍'];

const MeetingChat = React.memo(({ meetingId, onClose }: Props) => {
  const { client } = useChatContext();
  const { user } = useUser();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sentMessageIdsRef = useRef(new Set<string>());
  const loadedRef = useRef(false);
  const hasJoinedChannelRef = useRef(false);
  const channelIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastLoadAttemptRef = useRef(0);

  const clientRef = useRef(client);
  const userRef = useRef(user);
  const isMountedRef = useRef(true);

  clientRef.current = client;
  userRef.current = user;

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
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  const channelId = `meeting-${meetingId}`;

  // ── Join channel via server API ────────────────────────────────────────
  const joinChannel = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser?.id || hasJoinedChannelRef.current) return;

    try {
      console.log('🔗 [Chat] Joining channel via server');
      const res = await fetch('/api/chat/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, memberId: currentUser.id }),
      });

      if (!res.ok) throw new Error('Failed to join channel');
      hasJoinedChannelRef.current = true;
      console.log('✅ [Chat] Joined channel');
    } catch (err) {
      console.error('❌ [Chat] Join error:', err);
    }
  }, [meetingId, channelId]);

  // ── Load messages ──────────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    const currentClient = clientRef.current;
    const currentUser = userRef.current;

    // Prevent rapid reloading
    const now = Date.now();
    if (now - lastLoadAttemptRef.current < 2000) {
      console.log('⏳ [Chat] Skipping rapid reload');
      return;
    }
    lastLoadAttemptRef.current = now;

    if (!currentClient || !currentUser?.id) {
      console.log('⏳ [Chat] No client or user');
      return;
    }

    if (loadedRef.current && messages.length > 0) {
      console.log('✅ [Chat] Already loaded');
      return;
    }

    console.log('📥 [Chat] Loading messages...');

    try {
      setIsLoading(true);
      setError(null);

      await joinChannel();

      const channel = currentClient.channel('messaging', channelId, {
        members: [currentUser.id],
      });

      channelIdRef.current = channelId;

      const response = await channel.query({
        messages: { limit: 50 },
      });

      if (!isMountedRef.current) return;

      const existingMessages: Message[] = (response.messages || []).map((msg: MessageResponse) => ({
        id: msg.id,
        text: msg.text || '',
        user: {
          id: msg.user?.id || '',
          name: msg.user?.name,
          image: msg.user?.image,
        },
        createdAt: msg.created_at || new Date().toISOString(),
        replyToId: (msg as any).replyToId,
        replyToText: (msg as any).replyToText,
        replyToUser: (msg as any).replyToUser,
        isEdited: (msg as any).isEdited || false,
        attachments: msg.attachments as Message['attachments'],
      }));

      // Clear and rebuild message IDs
      sentMessageIdsRef.current.clear();
      existingMessages.forEach(msg => sentMessageIdsRef.current.add(msg.id));

      setMessages(existingMessages);
      console.log(`✅ [Chat] Loaded ${existingMessages.length} messages`);

      await channel.watch();

      loadedRef.current = true;
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('❌ [Chat] Load error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Chat unavailable';
      setError(errorMsg.includes('not allowed') || errorMsg.includes('permission')
        ? 'Không có quyền truy cập chat'
        : errorMsg);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [channelId, joinChannel, messages.length]);

  // ── Initialize ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!client) {
      console.log('⏳ [Chat] Client not available yet');
      return;
    }

    if (channelIdRef.current !== channelId) {
      loadedRef.current = false;
      hasJoinedChannelRef.current = false;
      channelIdRef.current = channelId;
    }

    if (loadedRef.current) {
      console.log('✅ [Chat] Already loaded, skipping');
      return;
    }

    console.log('📥 [Chat] Initializing with client');
    void loadMessages();
  }, [channelId, client, loadMessages]);

  // ── Listen for events ──────────────────────────────────────────────────
  useEffect(() => {
    const currentClient = clientRef.current;
    if (!currentClient || !channelIdRef.current) return;

    const channel = currentClient.channel('messaging', channelIdRef.current);
    const currentUser = userRef.current;

    const handleNewMessage = (event: { message?: MessageResponse }) => {
      const msg = event.message;
      if (!msg) return;

      // Skip duplicates
      if (sentMessageIdsRef.current.has(msg.id)) {
        console.log('⚠️ [Chat] Duplicate:', msg.id);
        return;
      }

      sentMessageIdsRef.current.add(msg.id);

      const newMsg: Message = {
        id: msg.id,
        text: msg.text || '',
        user: {
          id: msg.user?.id || '',
          name: msg.user?.name,
          image: msg.user?.image,
        },
        createdAt: msg.created_at || new Date().toISOString(),
        replyToId: (msg as any).replyToId,
        replyToText: (msg as any).replyToText,
        replyToUser: (msg as any).replyToUser,
        attachments: msg.attachments as Message['attachments'],
      };

      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    };

    const handleMessageUpdated = (event: { message?: MessageResponse }) => {
      const msg = event.message;
      if (!msg) return;

      setMessages(prev =>
        prev.map(m =>
          m.id === msg.id
            ? { ...m, text: msg.text || '', isEdited: true }
            : m
        )
      );
    };

    const handleMessageDeleted = (event: { message?: { id: string } }) => {
      const msg = event.message;
      if (!msg) return;

      setMessages(prev => prev.filter(m => m.id !== msg.id));
      sentMessageIdsRef.current.delete(msg.id);
    };

    channel.on('message.new', handleNewMessage as never);
    channel.on('message.updated', handleMessageUpdated as never);
    channel.on('message.deleted', handleMessageDeleted as never);

    return () => {
      channel.off('message.new', handleNewMessage as never);
      channel.off('message.updated', handleMessageUpdated as never);
      channel.off('message.deleted', handleMessageDeleted as never);
    };
  }, []);

  // ── Send message ────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    const currentClient = clientRef.current;
    const currentUser = userRef.current;

    if (!text && !selectedImage) return;
    if (!currentClient || !currentUser?.id) return;

    const channel = currentClient.channel('messaging', channelId);

    setInput('');
    setShowEmojiPicker(false);
    setImagePreview(null);
    setSelectedImage(null);

    try {
      const messageData: Record<string, any> = { text: text || '📎' };

      if (replyingTo) {
        messageData.replyToId = replyingTo.id;
        messageData.replyToText = replyingTo.text;
        messageData.replyToUser = replyingTo.user.name;
      }

      if (selectedImage) {
        const imageUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(selectedImage);
        });
        messageData.attachments = [{ type: 'image', image_url: imageUrl }];
      }

      const result = await channel.sendMessage(messageData);
      const sentMsg = result.message;

      if (!sentMsg) return;

      sentMessageIdsRef.current.add(sentMsg.id);

      const newMsg: Message = {
        id: sentMsg.id,
        text: sentMsg.text || text,
        user: {
          id: sentMsg.user?.id || currentUser.id,
          name: sentMsg.user?.name || currentUser.fullName || currentUser.username || 'User',
          image: sentMsg.user?.image || currentUser.imageUrl,
        },
        createdAt: sentMsg.created_at || new Date().toISOString(),
        replyToId: replyingTo?.id,
        replyToText: replyingTo?.text,
        replyToUser: replyingTo?.user.name,
        attachments: sentMsg.attachments as Message['attachments'],
      };

      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      setReplyingTo(null);
    } catch (err) {
      console.error('❌ [Chat] Send error:', err);
      if (text) setInput(text);
    }
  }, [input, channelId, replyingTo, selectedImage]);

  // ── Edit message ─────────────────────────────────────────────────────────
  const handleEditMessage = useCallback(async (msgId: string) => {
    const currentClient = clientRef.current;
    if (!currentClient || !editText.trim()) return;

    const newText = editText.trim();

    try {
      await currentClient.updateMessage({ id: msgId, text: newText } as any);

      setMessages(prev =>
        prev.map(m =>
          m.id === msgId
            ? { ...m, text: newText, isEdited: true }
            : m
        )
      );

      setEditingMsgId(null);
      setEditText('');
    } catch (err) {
      console.error('❌ [Chat] Edit error:', err);
    }
  }, [editText]);

  // ── Delete message ──────────────────────────────────────────────────────
  const handleDeleteMessage = useCallback(async (msgId: string) => {
    const currentClient = clientRef.current;
    if (!currentClient) return;

    try {
      await currentClient.deleteMessage(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
      sentMessageIdsRef.current.delete(msgId);
    } catch (err) {
      console.error('❌ [Chat] Delete error:', err);
    }
  }, []);

  // ── Reply ───────────────────────────────────────────────────────────────
  const handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
    setShowEmojiPicker(false);
  }, []);

  // ── Start editing ──────────────────────────────────────────────────────
  const handleStartEdit = useCallback((msg: Message) => {
    setEditingMsgId(msg.id);
    setEditText(msg.text);
    setShowEmojiPicker(false);
  }, []);

  // ── Emoji ──────────────────────────────────────────────────────────────
  const handleAddEmoji = useCallback((emoji: string) => {
    setInput(prev => prev + emoji);
    setShowEmojiPicker(false);
  }, []);

  // ── Image ──────────────────────────────────────────────────────────────
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file hình ảnh');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
      setSelectedImage(file);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveImage = useCallback(() => {
    setImagePreview(null);
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // ── Retry ───────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    loadedRef.current = false;
    hasJoinedChannelRef.current = false;
    sentMessageIdsRef.current.clear();
    setMessages([]);
    setError(null);
    lastLoadAttemptRef.current = 0;
    void loadMessages();
  }, [loadMessages]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-dark-1">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-3">
        <h2 className="font-semibold text-white">💬 Tin nhắn</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-dark-3 text-white/60 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sky-2">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
            <p>{error}</p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Thử lại
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/40">
            Chưa có tin nhắn nào
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map(msg => {
              const isOwn = msg.user.id === user?.id;
              const isEditing = editingMsgId === msg.id;
              const hasImage = msg.attachments?.some(a => a.type === 'image');

              return (
                <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                  {/* Reply reference */}
                  {msg.replyToId && msg.replyToText && (
                    <div className={`flex items-center gap-1.5 mb-1 px-2 py-1 rounded bg-dark-3/60 text-xs text-white/50 ${isOwn ? 'flex-row-reverse' : ''}`}>
                      <CornerDownRight size={12} className="text-blue-400 flex-shrink-0" />
                      <span className="truncate max-w-[200px]">{msg.replyToUser}: {msg.replyToText}</span>
                    </div>
                  )}

                  {/* Message container */}
                  <div className={`group flex items-end gap-2 max-w-[85%] ${isOwn ? 'flex-row-reverse' : ''}`}>
                    {/* Bubble */}
                    <div
                      className={`relative px-3 py-2 rounded-2xl break-words ${
                        isOwn
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-dark-3 text-white/90 rounded-bl-md'
                      }`}
                    >
                      {/* User name (for others) */}
                      {!isOwn && (
                        <p className="text-xs text-blue-400 mb-0.5 font-medium">{msg.user.name || 'User'}</p>
                      )}

                      {/* Text content */}
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleEditMessage(msg.id);
                              if (e.key === 'Escape') setEditingMsgId(null);
                            }}
                            className="bg-white/20 text-white text-sm rounded px-2 py-1 w-full"
                            autoFocus
                          />
                          <button onClick={() => handleEditMessage(msg.id)} className="text-white">
                            <Check size={16} />
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                      )}

                      {/* Image attachment */}
                      {hasImage && (
                        <div className="mt-1">
                          {msg.attachments?.filter(a => a.type === 'image').map((a, i) => (
                            <img
                              key={i}
                              src={a.image_url}
                              alt="Attachment"
                              className="max-w-full max-h-48 rounded-lg object-cover"
                            />
                          ))}
                        </div>
                      )}

                      {/* Footer: time + edited indicator */}
                      <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] text-white/50">{formatTime(msg.createdAt)}</span>
                        {msg.isEdited && <span className="text-[10px] text-white/30">(đã sửa)</span>}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className={`flex items-center gap-1 pb-1 ${isOwn ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                      <button
                        onClick={() => handleReply(msg)}
                        className="p-1.5 rounded-lg hover:bg-dark-3 text-white/50 hover:text-white"
                        title="Trả lời"
                      >
                        <Reply size={14} />
                      </button>
                      {isOwn && (
                        <>
                          <button
                            onClick={() => handleStartEdit(msg)}
                            className="p-1.5 rounded-lg hover:bg-dark-3 text-white/50 hover:text-white"
                            title="Sửa"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500 text-white/50 hover:text-white"
                            title="Xóa"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply preview */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-3 py-2 bg-dark-3/50 border-t border-dark-3">
          <CornerDownRight size={14} className="text-blue-400" />
          <span className="text-xs text-white/60 flex-1 truncate">
            Trả lời {replyingTo.user.name || 'User'}: {replyingTo.text.slice(0, 50)}
          </span>
          <button onClick={() => setReplyingTo(null)} className="text-white/40 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="flex items-center gap-2 px-3 py-2 bg-dark-3/50 border-t border-dark-3">
          <img src={imagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-lg" />
          <button onClick={handleRemoveImage} className="text-red-400 hover:text-red-300">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Input */}
      {!error && (
        <div className="flex-shrink-0 border-t border-dark-3 p-3">
          {showEmojiPicker && (
            <div className="flex flex-wrap gap-1 mb-2 p-2 bg-dark-3 rounded-lg">
              {EMOJI_LIST.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleAddEmoji(emoji)}
                  className="p-1.5 hover:bg-dark-4 rounded-lg text-lg transition-transform hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2 rounded-lg hover:bg-dark-3 text-white/60 hover:text-white transition-colors"
            >
              <Smile size={20} />
            </button>

            <label className="p-2 rounded-lg hover:bg-dark-3 text-white/60 hover:text-white cursor-pointer transition-colors">
              <ImageIcon size={20} />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
            </label>

            <input
              type="text"
              placeholder="Nhập tin nhắn..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="flex-1 bg-dark-3 text-white text-sm rounded-xl px-4 py-2.5 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
              onClick={handleSend}
              disabled={!input.trim() && !selectedImage}
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
