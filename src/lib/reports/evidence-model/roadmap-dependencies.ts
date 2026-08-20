import { periodDays } from './deterministic';
import type { RoadmapAction } from './types';

export class RoadmapDependencyError extends Error {
  readonly code = 'roadmap_dependency_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'RoadmapDependencyError';
  }
}

export type RoadmapReadyComparator = (left: RoadmapAction, right: RoadmapAction) => number;

const defaultReadyComparator: RoadmapReadyComparator = (left, right) =>
  periodDays(left.period) - periodDays(right.period) || left.id.localeCompare(right.id);

/**
 * Validates and deterministically topologically orders roadmap actions. Urgency is considered only
 * among nodes whose prerequisites have already been emitted; blocked cyclic nodes are never
 * selected as a fallback.
 */
export function orderRoadmapActions(
  actions: RoadmapAction[],
  compareReady: RoadmapReadyComparator = defaultReadyComparator
): RoadmapAction[] {
  const byId = new Map<string, RoadmapAction>();
  for (const action of actions) {
    if (byId.has(action.id)) {
      throw new RoadmapDependencyError(`Roadmap action ${action.id} is duplicated.`);
    }
    byId.set(action.id, action);
  }

  for (const action of actions) {
    for (const dependencyId of action.dependencyIds) {
      if (dependencyId === action.id) {
        throw new RoadmapDependencyError(`Roadmap action ${action.id} depends on itself.`);
      }
      if (!byId.has(dependencyId)) {
        throw new RoadmapDependencyError(`Roadmap action ${action.id} depends on unknown action ${dependencyId}.`);
      }
    }
  }

  const remaining = new Map([...byId.entries()].sort(([left], [right]) => left.localeCompare(right)));
  const completed = new Set<string>();
  const ordered: RoadmapAction[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((action) => action.dependencyIds.every((dependencyId) => completed.has(dependencyId)))
      .sort((left, right) => compareReady(left, right) || left.id.localeCompare(right.id));

    if (ready.length === 0) {
      throw new RoadmapDependencyError(
        `Roadmap dependency cycle detected among ${[...remaining.keys()].sort().join(', ')}.`
      );
    }

    const next = ready[0];
    ordered.push(next);
    completed.add(next.id);
    remaining.delete(next.id);
  }

  return ordered;
}
