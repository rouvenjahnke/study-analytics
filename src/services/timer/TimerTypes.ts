export type TimerMode = 'pomodoro' | 'stopwatch' | 'recurring';

export interface TimerState {
  mode: TimerMode;
  isRunning: boolean;
  isBreak: boolean;
  startEpoch: number | null; // ms since epoch
  endEpoch: number | null;   // for countdown modes
  elapsedMs: number;         // for stopwatch
  remainingSec: number;      // for countdown (pomodoro)
  goalRemainingSec: number;  // for recurring (seconds)
}

export interface TimerConfig {
  pomodoroSec: number;
  shortBreakSec: number;
  longBreakSec: number;
  longBreakInterval: number;
}

export interface TimerCallbacks {
  onTick?: () => void;
  onComplete?: () => void;
}

