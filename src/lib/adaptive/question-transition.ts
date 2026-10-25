export type QuestionTransitionPhase = 'idle' | 'collapsing' | 'confirmed' | 'entering';
export const QUESTION_MOTION = { collapseMs: 100, confirmationMs: 40, entryMs: 40 } as const;

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
  const expectedPhase = kind === 'exit' ? 'collapsing' : 'entering';
  let stage = root();
  if (stage && stage.dataset.transitionPhase !== expectedPhase && typeof MutationObserver !== 'undefined') {
    // React's DOM commit is the barrier. Waiting for display frames here unnecessarily
    // stretches both ends of the sequence on 30Hz browsers. Reading getAnimations below
    // resolves the committed style and observes its real completion before unlocking input.
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        observer.disconnect();
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        error ? reject(error) : resolve();
      };
      const cancel = () => finish(aborted());
      const observer = new MutationObserver(() => {
        if (stage?.dataset.transitionPhase === expectedPhase) finish();
      });
      const timer = setTimeout(() => finish(new Error('Question phase did not commit')), 500);
      observer.observe(stage!, { attributes: true, attributeFilter: ['data-transition-phase'] });
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
  } else if (!stage || typeof MutationObserver === 'undefined') {
    await frame(signal);
    await frame(signal);
  }
  stage = root();
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
