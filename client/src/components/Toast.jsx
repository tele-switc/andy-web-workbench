import React, { useEffect, useState } from 'react';

export default function Toast({ messages }) {
  const [visible, setVisible] = useState([]);

  useEffect(() => {
    if (messages.length > 0) {
      setVisible(messages);
      const timer = setTimeout(() => setVisible([]), 2400);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  if (visible.length === 0) return null;

  return (
    <div className="toast-wrap">
      {visible.map((msg, i) => (
        <div key={i} className={`toast ${msg.type || ''}`}>{msg.text || msg}</div>
      ))}
    </div>
  );
}
