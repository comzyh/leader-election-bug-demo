# Subscription Manager Bug Reproduction

## The Bug

When opening multiple tabs, **all tabs become leaders** instead of electing a single leader.

**Expected:** Only ONE tab should be leader, others should be followers.

**Actual:** Every tab becomes a leader and opens its own SSE connection.

**Root Cause:** Unknown - this is a test case for troubleshooting.

## Setup

```bash
npm install
```

## Running

**Terminal 1: Start SSE Server**
```bash
npm run server
```

**Terminal 2: Start Frontend**
```bash
npm run dev
```

## Reproduce the Bug

1. Open http://localhost:5173 in your browser
2. Open browser console (F12)
3. First tab shows "Role: 👑 Leader" - ✅ correct
4. Open a SECOND tab at http://localhost:5173
5. Second tab also shows "Role: 👑 Leader" - ❌ **BUG**
6. Server console shows 2 SSE connections - ❌ should be only 1

## Key Observations

1. First tab: Becomes leader ✅
2. Second tab: Also becomes leader ❌ (should be follower)
3. Server logs: 2 SSE connections ❌ (should be 1)
4. Both tabs log: `awaitLeadership() resolved`

## Expected Behavior

- **Tab 1:** Leader (👑), opens SSE connection
- **Tab 2:** Follower (👥), receives broadcasts from Tab 1
- **Server:** Only 1 connection

## Project Structure

```
src/
  subscriptionManager.ts  # Simplified manager with bug
  App.tsx                 # Test component showing leader/follower status
  main.tsx                # React entry point
server.js                 # Node.js SSE server
```
