import { useCallback, useEffect, useRef, useState } from 'react'
import { getSubscriptionManager } from './subscriptionManager'

function App() {
  const [messageCount, setMessageCount] = useState(0)
  const [isLeader, setIsLeader] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const managerRef = useRef<ReturnType<typeof getSubscriptionManager> | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const handleMessage = useCallback((data: any) => {
    console.log('[App] Received message:', data);
    setMessageCount(prev => prev + 1);
    setMessages(prev => [...prev, data].slice(-5)); // Keep last 5 messages
  }, []);

  const subscribeToStream = useCallback(() => {
    if (!managerRef.current || unsubscribeRef.current) {
      return;
    }

    unsubscribeRef.current = managerRef.current.subscribe('http://localhost:8001/stream', handleMessage);
    setIsSubscribed(true);
  }, [handleMessage]);

  const unsubscribeFromStream = useCallback(() => {
    if (!unsubscribeRef.current) {
      return;
    }

    unsubscribeRef.current();
    unsubscribeRef.current = null;
    setIsSubscribed(false);
  }, []);

  useEffect(() => {
    console.log('[App] Component mounted, subscribing to SSE');
    const manager = getSubscriptionManager();
    managerRef.current = manager;

    // Keep existing default behavior: subscribe immediately on mount
    subscribeToStream();

    // Subscribe to status changes
    const unsubscribeStatus = manager.onStatusChange((status) => {
      setIsLeader(status.isLeader);
    });

    return () => {
      console.log('[App] Component unmounting, unsubscribing');
      unsubscribeStatus();
      unsubscribeFromStream();
      managerRef.current = null;
    };
  }, [subscribeToStream, unsubscribeFromStream]);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Subscription Manager Bug Reproduction</h1>

      <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <h2>Status</h2>
        <p><strong>Role:</strong> {isLeader ? '👑 Leader' : '👥 Follower'}</p>
        <p><strong>Subscribed:</strong> {isSubscribed ? 'Yes' : 'No'}</p>
        <p><strong>Messages Received:</strong> {messageCount}</p>
        <button
          onClick={isSubscribed ? unsubscribeFromStream : subscribeToStream}
          style={{ marginTop: '10px', padding: '8px 12px', cursor: 'pointer' }}
        >
          {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
        </button>
      </div>

      <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <h2>Recent Messages</h2>
        {messages.length === 0 ? (
          <p style={{ color: '#999' }}>No messages received yet...</p>
        ) : (
          <ul>
            {messages.map((msg, idx) => (
              <li key={idx}>{JSON.stringify(msg)}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#fff3cd', border: '1px solid #ffc107' }}>
        <h3>🐛 Bug to Reproduce:</h3>
        <ol>
          <li>Open this page in one tab - check console, you should see it become leader (👑)</li>
          <li>Open a SECOND tab with the same URL</li>
          <li>Check console in BOTH tabs</li>
          <li><strong>BUG:</strong> Both tabs show "<code>awaitLeadership() resolved</code>" - they're BOTH leaders!</li>
          <li>Both tabs open their own SSE connections</li>
          <li>Expected: Only ONE tab should be leader, others should be followers</li>
        </ol>
        <p style={{ marginTop: '10px', color: '#856404' }}>
          <strong>Root cause:</strong> Unknown - this is a test case for AI troubleshooting.
        </p>
      </div>

      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#d4edda', border: '1px solid #28a745' }}>
        <h3>✅ Expected Correct Behavior:</h3>
        <ol>
          <li>First tab opens: Becomes leader (👑), opens SSE connection</li>
          <li>Second tab opens: Becomes follower (👥), receives broadcasts from leader</li>
          <li>Only ONE SSE connection to server (from the leader)</li>
          <li>All tabs receive messages via BroadcastChannel</li>
          <li>If leader tab closes, one follower should become new leader</li>
        </ol>
      </div>
    </div>
  )
}

export default App
