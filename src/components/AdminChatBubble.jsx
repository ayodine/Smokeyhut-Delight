import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function AdminChatBubble() {
  const { userRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Only render for Admins
  if (userRole !== 'Admin') return null;

  const toggleChat = () => {
    if (!isOpen && messages.length === 0) {
      setMessages([{ role: 'assistant', content: 'Hi there! I am the Smokeyhut AI Assistant. You can ask me anything about sales, top products, customers, or expenses!' }]);
    }
    setIsOpen(!isOpen);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const newMsg = { role: 'user', content: input.trim() };
    const chatHistory = [...messages, newMsg];
    setMessages(chatHistory);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ messages: chatHistory })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Server error:', res.status, errText);
        throw new Error(`Server error: ${errText}`);
      }
      const data = await res.json();
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error while processing your request.' }]);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 700,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end'
    }}>
      {isOpen && (
        <div style={{
          width: 350, height: 480, background: '#fff', borderRadius: 16,
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          marginBottom: 16, animation: 'slideUp 0.3s ease'
        }}>
          <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          
          <div style={{
            background: 'var(--red)', padding: '16px 20px', color: '#fff',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <Sparkles size={18} /> Admin AI Assistant
            </div>
            <button onClick={toggleChat} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-color)' }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user' ? 'var(--red)' : '#fff',
                color: msg.role === 'user' ? '#fff' : 'var(--text)',
                padding: '10px 14px', borderRadius: 12, border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
                maxWidth: '85%', fontSize: '0.88rem', lineHeight: 1.4,
                borderBottomRightRadius: msg.role === 'user' ? 2 : 12,
                borderBottomLeftRadius: msg.role === 'assistant' ? 2 : 12,
              }}>
                {msg.content}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', background: '#fff', border: '1px solid var(--border-subtle)', padding: '10px 14px', borderRadius: 12, borderBottomLeftRadius: 2 }}>
                <Loader2 size={16} className="spin" color="var(--red)" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} style={{ display: 'flex', padding: 12, background: '#fff', borderTop: '1px solid var(--border-subtle)' }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about sales, top items..."
              disabled={loading}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: '1px solid var(--border-subtle)', outline: 'none', fontSize: '0.88rem', fontFamily: "'DM Sans', sans-serif" }}
            />
            <button type="submit" disabled={!input.trim() || loading} style={{
              background: input.trim() && !loading ? 'var(--red)' : 'var(--border-subtle)',
              color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 8,
              cursor: input.trim() && !loading ? 'pointer' : 'default', transition: '0.2s'
            }}>
              <Send size={18} style={{ marginLeft: -2 }} />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={toggleChat}
        style={{
          background: 'var(--red)', color: '#fff', border: 'none',
          width: 56, height: 56, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(192,32,31,0.4)', cursor: 'pointer',
          transition: 'transform 0.2s', transform: isOpen ? 'scale(0.9)' : 'scale(1)'
        }}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>
    </div>
  );
}
