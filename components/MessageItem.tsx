'use client';

import React, { memo } from 'react';
import type { MessageUIComponentProps } from 'stream-chat-react';

/**
 * Custom message — NO avatar. Shows: name + time + text bubble.
 */
const MessageItem = memo((props: MessageUIComponentProps) => {
  const { message } = props;
  if (!message) return null;

  const userName = message.user?.name || message.user?.id || 'Unknown';
  const text = message.text || '';
  const createdAt = message.created_at
    ? new Date(message.created_at).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        marginBottom: '10px',
        padding: '0 12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: '12px', color: '#fff' }}>
          {userName}
        </span>
        <span style={{ fontSize: '10px', color: '#8899aa' }}>
          {createdAt}
        </span>
      </div>
      <div
        style={{
          fontSize: '14px',
          color: '#fff',
          backgroundColor: '#252A41',
          borderRadius: '12px 12px 12px 4px',
          padding: '8px 12px',
          display: 'inline-block',
          alignSelf: 'flex-start',
          maxWidth: '80%',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export default MessageItem;
