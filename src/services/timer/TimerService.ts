import { TimerCallbacks, TimerConfig, TimerMode, TimerState } from './TimerTypes';

export class TimerService {
  private state: TimerState;
  private cfg: TimerConfig;
  private cb: TimerCallbacks;
  private interval: number | null = null;
  private pomodoroCount = 0;

  constructor(cfg: TimerConfig, initialMode: TimerMode = 'pomodoro', callbacks: TimerCallbacks = {}) {
    this.cfg = cfg;
    this.cb = callbacks;
    this.state = {
      mode: initialMode,
      isRunning: false,
      isBreak: false,
      startEpoch: null,
      endEpoch: null,
      elapsedMs: 0,
      remainingSec: cfg.pomodoroSec,
      goalRemainingSec: 0,
    };
  }

  setCallbacks(cb: TimerCallbacks) { this.cb = cb; }
  setMode(mode: TimerMode) { this.stop(); this.state.mode = mode; this.reset(); }
  setRecurringGoalSeconds(sec: number) { this.state.goalRemainingSec = Math.max(0, Math.floor(sec)); }
  setPomodoroSeconds(sec: number) { this.cfg.pomodoroSec = sec; if (this.state.mode==='pomodoro') this.state.remainingSec = sec; }

  getState(): Readonly<TimerState> { return this.state; }
  getPomodoroCount(): number { return this.pomodoroCount; }

  start() {
    if (this.state.isRunning) return;
    const now = Date.now();
    this.state.isRunning = true;
    this.state.startEpoch = now;
    if (this.state.mode === 'pomodoro') {
      this.state.endEpoch = now + this.state.remainingSec * 1000;
    }
    this.tickLoop();
  }

  pause() {
    if (!this.state.isRunning) return;
    this.state.isRunning = false;
    if (this.interval) { window.clearInterval(this.interval); this.interval = null; }
    const now = Date.now();
    if (this.state.mode === 'pomodoro' && this.state.endEpoch) {
      const remaining = Math.max(0, Math.ceil((this.state.endEpoch - now)/1000));
      this.state.remainingSec = remaining;
      this.state.endEpoch = null;
    } else if (this.state.mode === 'stopwatch' && this.state.startEpoch) {
      this.state.elapsedMs += (now - this.state.startEpoch);
    } else if (this.state.mode === 'recurring' && this.state.startEpoch) {
      const elapsedSec = Math.floor((now - this.state.startEpoch)/1000);
      this.state.goalRemainingSec = Math.max(0, this.state.goalRemainingSec - elapsedSec);
    }
    this.state.startEpoch = null;
    this.cb.onTick?.();
  }

  stop() { if (this.state.isRunning) this.pause(); }

  reset() {
    if (this.state.mode === 'pomodoro') {
      this.state.isBreak = false;
      this.state.remainingSec = this.cfg.pomodoroSec;
      this.state.elapsedMs = 0;
    } else if (this.state.mode === 'stopwatch') {
      this.state.elapsedMs = 0;
    }
    this.state.startEpoch = null;
    this.state.endEpoch = null;
    this.cb.onTick?.();
  }

  private tickLoop() {
    if (this.interval) window.clearInterval(this.interval);
    this.interval = window.setInterval(() => this.tick(), 100);
  }

  private tick() {
    if (!this.state.isRunning) return;
    const now = Date.now();
    if (this.state.mode === 'pomodoro') {
      if (!this.state.endEpoch) return;
      const remaining = Math.max(0, Math.ceil((this.state.endEpoch - now)/1000));
      this.state.remainingSec = remaining;
      if (remaining <= 0) {
        this.onPomodoroComplete();
      }
    } else if (this.state.mode === 'stopwatch') {
      if (!this.state.startEpoch) return;
      this.state.elapsedMs = (now - this.state.startEpoch);
    } else if (this.state.mode === 'recurring') {
      if (!this.state.startEpoch) return;
      const elapsedSec = Math.floor((now - this.state.startEpoch)/1000);
      if (elapsedSec > 0) {
        // Subtract the actual elapsed seconds to avoid drift (e.g., sleep)
        this.state.goalRemainingSec = Math.max(0, this.state.goalRemainingSec - elapsedSec);
        // Advance startEpoch by the consumed whole seconds, keep leftover ms
        this.state.startEpoch = this.state.startEpoch + elapsedSec * 1000;
      }
      if (this.state.goalRemainingSec <= 0) {
        this.onRecurringComplete();
      }
    }
    this.cb.onTick?.();
  }

  private onPomodoroComplete() {
    this.pause();
    if (!this.state.isBreak) {
      this.pomodoroCount += 1;
      this.state.isBreak = true;
      // set next break length will be decided by external logic if needed
    } else {
      this.state.isBreak = false;
    }
    this.cb.onComplete?.();
  }

  private onRecurringComplete() {
    this.pause();
    this.cb.onComplete?.();
  }
}
