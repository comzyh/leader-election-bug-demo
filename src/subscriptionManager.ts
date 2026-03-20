import { BroadcastChannel, createLeaderElection } from "broadcast-channel";
import type { LeaderElector } from "broadcast-channel";

/**
 * Minimal reproduction of the subscription manager bug.
 *
 * THE BUG: When opening 2 tabs in the same browser window, BOTH tabs become leaders.
 * Expected behavior: Only ONE tab should be elected as leader.
 * Root cause: Unknown - this is a test case for troubleshooting.
 */

type MessageCallback = (data: any) => void;

type BroadcastMessage =
  | {
      type: "UPDATE";
      data: any;
    }
  | {
      type: "LEADER_PING";
      leaderId: string;
    };

export interface ManagerStatus {
  isSubscribing: boolean;
  isLeader: boolean;
}

type StatusListener = (status: ManagerStatus) => void;

class SubscriptionManager {
  private channel: BroadcastChannel<BroadcastMessage>;
  private elector: LeaderElector;
  private callbacks: Set<MessageCallback> = new Set();
  private eventSource: EventSource | null = null;
  private currentUrl: string | null = null;
  private myId: string = Math.random().toString(36).substring(2, 9);
  private leaderPingInterval: ReturnType<typeof setInterval> | null = null;
  private isDestroyed: boolean = false;
  private statusListeners: Set<StatusListener> = new Set();

  constructor() {
    console.log(`[SubscriptionManager] Creating new instance: ${this.myId}`);
    this.channel = new BroadcastChannel<BroadcastMessage>("task_updates");
    this.elector = createLeaderElection(this.channel);

    console.log(`[SubscriptionManager] Elector created - isLeader: ${this.elector.isLeader}, isDead: ${this.elector.isDead}`);

    this.channel.onmessage = (msg: BroadcastMessage) => {
      if (msg.type === "UPDATE") {
        console.log(`[SubscriptionManager] Received UPDATE on tab ${this.myId}`);
        this.callbacks.forEach((cb) => {
          try {
            cb(msg.data);
          } catch (err) {
            console.error("[SubscriptionManager] Callback error:", err);
          }
        });
      } else if (msg.type === "LEADER_PING") {
        console.log(`[SubscriptionManager] Leader ${msg.leaderId} is alive (I am ${this.myId})`);
      }
      this.notifyStatusChange();
    };
  }

  public getStatus(): ManagerStatus {
    return {
      isSubscribing: this.callbacks.size > 0,
      isLeader: this.elector.isLeader,
    };
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    try {
      listener(this.getStatus());
    } catch {
      // ignore listener errors during initial status notification
    }
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyStatusChange() {
    const status = this.getStatus();
    this.statusListeners.forEach((listener) => {
      try {
        listener(status);
      } catch (err) {
        console.error("[SubscriptionManager] Status listener error:", err);
      }
    });
  }

  private openEventSource(url: string) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    console.log(`[SubscriptionManager] Opening EventSource: ${url}`);
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log(`[SubscriptionManager] EventSource connected`);
    };

    this.eventSource.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[SubscriptionManager] Received SSE message:`, data);
        this.callbacks.forEach((cb) => {
          try {
            cb(data);
          } catch (err) {
            console.error("[SubscriptionManager] Callback error:", err);
          }
        });
        this.channel.postMessage({ type: "UPDATE", data });
      } catch (err) {
        console.error("[SubscriptionManager] Failed to parse SSE data", err);
      }
    });

    this.eventSource.onerror = (error) => {
      console.error("[SubscriptionManager] EventSource error", error);
    };
  }

  private joinElection() {
    console.log(`[SubscriptionManager] joinElection() called for tab ${this.myId}`);

    this.elector.awaitLeadership().then(() => {
      console.log(`[SubscriptionManager] This tab (${this.myId}) is now the leader`);

      if (this.currentUrl) {
        this.openEventSource(this.currentUrl);
      }

      if (this.leaderPingInterval) {
        clearInterval(this.leaderPingInterval);
      }
      this.leaderPingInterval = setInterval(() => {
        if (this.elector.isLeader) {
          console.log(`[SubscriptionManager] Sending LEADER_PING from tab ${this.myId}`);
          this.channel.postMessage({
            type: "LEADER_PING",
            leaderId: this.myId,
          });
        }
      }, 5000);

      this.notifyStatusChange();
    });
  }

  private exitElection() {
    console.log(`[SubscriptionManager] exitElection() called for tab ${this.myId}`);

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.leaderPingInterval) {
      clearInterval(this.leaderPingInterval);
      this.leaderPingInterval = null;
    }

    void this.elector.die().then(() => {
      if (!this.isDestroyed && this.elector.isDead) {
        console.log(`[SubscriptionManager] Elector died, creating new one`);
        this.elector = createLeaderElection(this.channel);
      }
    });
  }

  public subscribe(url: string, callback: MessageCallback): () => void {
    console.log(`[SubscriptionManager] subscribe() called for tab ${this.myId} - callbacks: ${this.callbacks.size}, isLeader: ${this.elector.isLeader}`);

    if (this.currentUrl && this.currentUrl !== url) {
      throw new Error(
        `SubscriptionManager only supports one URL at a time. ` +
          `Current URL: ${this.currentUrl}, attempted: ${url}`
      );
    }

    if (this.callbacks.size === 0) {
      console.log(`[SubscriptionManager] First subscriber - joining election`);
      this.joinElection();
    }

    this.currentUrl = url;
    this.callbacks.add(callback);
    this.notifyStatusChange();

    if (this.elector.isLeader) {
      console.log(`[SubscriptionManager] Already leader - ensuring connection`);
      if (!this.eventSource && this.currentUrl) {
        this.openEventSource(this.currentUrl);
      }
    }

    return () => {
      console.log(`[SubscriptionManager] unsubscribe() called for tab ${this.myId}`);
      this.callbacks.delete(callback);
      if (this.callbacks.size === 0) {
        console.log(`[SubscriptionManager] Last subscriber removed - exiting election`);
        this.currentUrl = null;
        this.exitElection();
      }
      this.notifyStatusChange();
    };
  }

  public async destroy() {
    console.log(`[SubscriptionManager] Destroying instance ${this.myId}`);
    this.isDestroyed = true;

    if (this.leaderPingInterval) {
      clearInterval(this.leaderPingInterval);
      this.leaderPingInterval = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.callbacks.clear();
    this.statusListeners.clear();

    try {
      await this.elector.die();
      await this.channel.close();
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Singleton instance
let instance: SubscriptionManager | null = null;
const GLOBAL_KEY = "__SUBSCRIPTION_MANAGER_INSTANCE__";

class WindowWithSubscriptionManager extends Window {
  [GLOBAL_KEY]?: SubscriptionManager;
}

export const getSubscriptionManager = (): SubscriptionManager => {
  if (instance) {
    console.log(`[SubscriptionManager] Returning existing singleton instance`);
    return instance;
  }

  // Clean up old instance during HMR
  if ((window as WindowWithSubscriptionManager)[GLOBAL_KEY]) {
    console.log(`[SubscriptionManager] Cleaning up old HMR instance`);
    (window as WindowWithSubscriptionManager)[GLOBAL_KEY]!.destroy();
  }

  console.log(`[SubscriptionManager] Creating new singleton instance`);
  instance = new SubscriptionManager();
  (window as WindowWithSubscriptionManager)[GLOBAL_KEY] = instance;
  return instance;
};
