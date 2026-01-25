/**
 * Utility functions for loading states, progress calculation, and time estimation
 */

/**
 * Calculate progress percentage based on current step and total steps
 */
export function calculateStepProgress(
  currentStep: number,
  totalSteps: number
): number {
  if (totalSteps <= 0) return 0;
  return Math.round(((currentStep + 1) / totalSteps) * 100);
}

/**
 * Estimate time remaining based on elapsed time and progress
 */
export function estimateTimeRemaining(
  elapsedSeconds: number,
  progress: number
): number | null {
  if (progress <= 0 || elapsedSeconds <= 0) {
    return null;
  }
  const rate = progress / elapsedSeconds; // progress per second
  const remaining = (100 - progress) / rate;
  return Math.max(0, Math.round(remaining));
}

/**
 * Format time in seconds to human-readable string
 */
export function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) {
    return `${mins}m`;
  }
  return `${mins}m ${secs}s`;
}

/**
 * Calculate progress from file upload event
 */
export function calculateUploadProgress(
  loaded: number,
  total: number
): number {
  if (total <= 0) return 0;
  return Math.round((loaded / total) * 100);
}

/**
 * Estimate time remaining for file upload
 */
export function estimateUploadTimeRemaining(
  loaded: number,
  total: number,
  elapsedSeconds: number
): number | null {
  if (loaded <= 0 || elapsedSeconds <= 0 || total <= 0) {
    return null;
  }
  const rate = loaded / elapsedSeconds; // bytes per second
  const remaining = (total - loaded) / rate;
  return Math.max(0, Math.round(remaining));
}

/**
 * Create a progress tracker for multi-step operations
 */
export class ProgressTracker {
  private steps: string[];
  private currentStepIndex: number;
  private startTime: number;
  private stepStartTimes: number[];

  constructor(steps: string[]) {
    this.steps = steps;
    this.currentStepIndex = -1;
    this.startTime = Date.now();
    this.stepStartTimes = [];
  }

  /**
   * Move to the next step
   */
  nextStep(): void {
    if (this.currentStepIndex >= 0) {
      this.stepStartTimes.push(Date.now());
    }
    this.currentStepIndex++;
  }

  /**
   * Get current step name
   */
  getCurrentStep(): string | null {
    if (this.currentStepIndex < 0 || this.currentStepIndex >= this.steps.length) {
      return null;
    }
    return this.steps[this.currentStepIndex];
  }

  /**
   * Get current progress (0-100)
   */
  getProgress(): number {
    if (this.currentStepIndex < 0) return 0;
    return calculateStepProgress(this.currentStepIndex, this.steps.length);
  }

  /**
   * Get current step label (e.g., "Step 2 of 5")
   */
  getStepLabel(): string {
    if (this.currentStepIndex < 0) {
      return `Step 1 of ${this.steps.length}`;
    }
    return `Step ${this.currentStepIndex + 1} of ${this.steps.length}`;
  }

  /**
   * Estimate time remaining based on average step time
   */
  getEstimatedTimeRemaining(): number | null {
    if (this.currentStepIndex < 0) {
      return null;
    }
    const elapsed = (Date.now() - this.startTime) / 1000;
    const progress = this.getProgress();
    return estimateTimeRemaining(elapsed, progress);
  }

  /**
   * Check if all steps are complete
   */
  isComplete(): boolean {
    return this.currentStepIndex >= this.steps.length - 1;
  }
}

