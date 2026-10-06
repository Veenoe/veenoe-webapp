export type RecoveryReason = "go_away" | "transport";

export interface LiveRecoveryOptions {
  apiVersion?: string;
  resumptionEnabled?: boolean;
  tokenExpiresAt?: string | null;
  newSessionExpiresAt?: string | null;
  sessionDeadlineAt?: string | null;
  recoveryBudgetMs?: number;
}

interface RecoveryDependencies {
  connect: (handle: string, deadline: number) => Promise<void>;
  onReconnecting: (reason: RecoveryReason) => void;
  onAttempt: (attempt: number) => void;
  onRecovered: (reason: RecoveryReason, elapsedMs: number) => void;
  onFailure: () => void;
}

/** One in-memory checkpoint and one bounded recovery owner for an entire viva. */
export class LiveRecovery {
  private handle: string | null = null;
  private resumable = false;
  private stopped = false;
  private recovering = false;
  private rotation: ReturnType<typeof setTimeout> | null = null;
  private cancelDelay: (() => void) | null = null;

  /** Bind this viva's expiry limits and transport; checkpoints never outlive this owner. */
  constructor(
    private options: LiveRecoveryOptions,
    private deps: RecoveryDependencies,
    private baseDelayMs = 1000,
  ) {}

  /** Retain the latest usable checkpoint and release a pending safe rotation. */
  update(resumable?: boolean, handle?: string): void {
    if (this.stopped) return;
    this.resumable = resumable === true;
    // A temporarily nonresumable state must not discard the previous checkpoint.
    if (resumable === true && handle) this.handle = handle;
    this.turnBoundary();
  }

  /** Rotate at a safe boundary, or one second before the provider's closure deadline. */
  goAway(timeLeft?: string): void {
    if (this.stopped || this.recovering || this.rotation) return;
    const match = timeLeft?.match(/^(\d+(?:\.\d+)?)s$/);
    const delay = match ? Math.max(0, Number(match[1]) * 1000 - 1000) : 0;
    this.rotation = setTimeout(() => {
      void this.recover("go_away");
    }, delay);
    this.turnBoundary();
  }

  /** A pending GoAway may proceed as soon as the provider marks its state resumable. */
  turnBoundary(): void {
    if (this.rotation && this.resumable) void this.recover("go_away");
  }

  /** Coalesce failure signals; each incident has its own retry count and deadline. */
  async recover(reason: RecoveryReason): Promise<void> {
    if (this.stopped || this.recovering) return;
    this.clearRotation();
    const started = Date.now();
    const deadline = Math.min(
      started + (this.options.recoveryBudgetMs ?? 20000),
      Date.parse(this.options.tokenExpiresAt ?? ""),
      Date.parse(this.options.sessionDeadlineAt ?? ""),
    );
    if (
      !this.options.resumptionEnabled ||
      !this.handle ||
      !Number.isFinite(deadline) ||
      deadline <= started
    ) {
      this.fail();
      return;
    }
    this.recovering = true;
    this.deps.onReconnecting(reason);
    // A successful recovery must not spend the next incident's three attempts.
    let attempts = 0;
    while (!this.stopped && attempts < 3 && Date.now() < deadline) {
      const attempt = ++attempts;
      this.deps.onAttempt(attempt);
      await this.delay(
        Math.min(
          this.baseDelayMs * 2 ** (attempt - 1),
          Math.max(0, deadline - Date.now()),
        ),
      );
      if (this.stopped || Date.now() >= deadline) break;
      try {
        await this.deps.connect(this.handle, deadline);
        if (this.stopped) return;
        this.recovering = false;
        this.deps.onRecovered(reason, Date.now() - started);
        return;
      } catch {
        /* Only exhaustion is a fatal session failure. */
      }
    }
    if (!this.stopped) this.fail();
  }

  /** Cancel rotation and backoff; an in-flight transport attempt is retired by its owner. */
  stop(): void {
    this.stopped = true;
    this.handle = null;
    this.resumable = false;
    this.clearRotation();
    this.cancelDelay?.();
  }

  /** Seal the recovery owner before notifying callers, preventing reentrant retries. */
  private fail(): void {
    this.stop();
    this.deps.onFailure();
  }

  /** Remove the scheduled GoAway fallback once recovery or teardown takes ownership. */
  private clearRotation(): void {
    if (this.rotation) clearTimeout(this.rotation);
    this.rotation = null;
  }

  /** Teardown releases the backoff promise immediately without starting another attempt. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.cancelDelay = null;
        resolve();
      }, ms);
      this.cancelDelay = () => {
        clearTimeout(timer);
        this.cancelDelay = null;
        resolve();
      };
    });
  }
}
