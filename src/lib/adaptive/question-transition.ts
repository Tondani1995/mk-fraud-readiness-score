export type QuestionTransitionPhase = 'idle' | 'collapsing' | 'confirmed' | 'entering';
export const QUESTION_MOTION = { collapseMs: 140, confirmationMs: 40, entryMs: 60 } as const;

function aborted() {
  return new DOMException('Transition cancelled', 'AbortError');
}
function assertActive(signal: AbortSignal) {
  if (signal.aborted) throw aborted();
}
export function motionDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    assertActive(signal);
    const cancel = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
function frame(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    assertActive(signal);
    const cancel = () => {
      cancelAnimationFrame(id);
      reject(aborted());
    };
    const id = requestAnimationFrame(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    });
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/** Observe the actual committed CSS transition, including delayed React paints. Never gate a network request. */
export async function waitForQuestionMotion(
  root: () => HTMLElement | null,
  kind: 'exit' | 'entry',
  signal: AbortSignal,
  reduced: boolean
) {
  if (reduced) {
    assertActive(signal);
    return;
  }
  await frame(signal);
  await frame(signal);
  const stage = root();
  const selector = kind === 'exit' ? '.answer-slot[data-exiting="true"]' : '.question-stage';
  const elements = stage ? [...stage.querySelectorAll<HTMLElement>(selector)] : [];
  const animations = elements.flatMap((element) =>
    typeof element.getAnimations === 'function' ? element.getAnimations() : []
  );
  // Older engines can lack Web Animations. The bounded fallback preserves the same visual budget.
  if (animations.length) {
    await Promise.race([
      Promise.allSettled(animations.map((animation) => animation.finished)),
      motionDelay((kind === 'exit' ? QUESTION_MOTION.collapseMs : QUESTION_MOTION.entryMs) + 64, signal)
    ]);
  } else if (elements.length) {
    await motionDelay(kind === 'exit' ? QUESTION_MOTION.collapseMs : QUESTION_MOTION.entryMs, signal);
  }
  assertActive(signal);
}

/** A per-write ticket: authoritative acknowledgement AND actual exit completion must precede advancement. */
export function createQuestionTransition(options: {
  reduced: boolean;
  phase: (phase: QuestionTransitionPhase) => void;
  exit: (signal: AbortSignal) => Promise<void>;
  entry: (signal: AbortSignal) => Promise<void>;
  delay?: typeof motionDelay;
}) {
  const controller = new AbortController();
  const signal = controller.signal;
  const delay = options.delay ?? motionDelay;
  options.phase('collapsing');
  const exit = options.reduced ? Promise.resolve() : options.exit(signal);
  // Cancellation can happen before the HTTP reply; attach a rejection observer immediately.
  void exit.catch(() => {});
  return {
    signal,
    async confirm() {
      await exit;
      assertActive(signal);
      options.phase('confirmed');
      if (!options.reduced) await delay(QUESTION_MOTION.confirmationMs, signal);
      assertActive(signal);
    },
    async enter() {
      assertActive(signal);
      options.phase('entering');
      if (!options.reduced) await options.entry(signal);
      assertActive(signal);
      options.phase('idle');
    },
    cancel() {
      controller.abort();
      options.phase('idle');
    }
  };
}
