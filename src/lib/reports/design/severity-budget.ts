import type { MkSeverity } from './tokens';

export type SeverityRequest = {
  page: number;
  severity: MkSeverity;
  label: string;
};

export type SeverityAllocation = SeverityRequest & {
  allocated: MkSeverity;
  downgraded: boolean;
};

/**
 * Render-time severity allocator. It is deliberately stateful per document so a component cannot
 * spend an unlimited amount of critical emphasis by choosing a colour locally.
 */
export class SeverityBudget {
  private readonly allocations: SeverityAllocation[] = [];
  private readonly pageCritical = new Map<number, number>();
  private readonly pageMajor = new Map<number, number>();

  request(request: SeverityRequest): SeverityAllocation {
    const critical = this.pageCritical.get(request.page) ?? 0;
    const major = this.pageMajor.get(request.page) ?? 0;
    const documentCritical = this.allocations.filter((item) => item.allocated === 'critical').length;

    let allocated = request.severity;
    if (request.severity === 'critical' && (critical >= 1 || documentCritical >= 3)) allocated = 'major';
    if (request.severity === 'major' && major >= 2) allocated = 'neutral';

    if (allocated === 'critical') this.pageCritical.set(request.page, critical + 1);
    if (allocated === 'major') this.pageMajor.set(request.page, major + 1);
    const result = { ...request, allocated, downgraded: allocated !== request.severity };
    this.allocations.push(result);
    return result;
  }

  snapshot(): SeverityAllocation[] {
    return this.allocations.map((allocation) => ({ ...allocation }));
  }

  assertWithinBudget(): void {
    const pageCritical = new Map<number, number>();
    const pageMajor = new Map<number, number>();
    for (const allocation of this.allocations) {
      if (allocation.allocated === 'critical') pageCritical.set(allocation.page, (pageCritical.get(allocation.page) ?? 0) + 1);
      if (allocation.allocated === 'major') pageMajor.set(allocation.page, (pageMajor.get(allocation.page) ?? 0) + 1);
    }
    for (const [page, count] of pageCritical) if (count > 1) throw new Error(`critical severity budget exceeded on page ${page}`);
    for (const [page, count] of pageMajor) if (count > 2) throw new Error(`major severity budget exceeded on page ${page}`);
    const totalCritical = [...pageCritical.values()].reduce((sum, count) => sum + count, 0);
    if (totalCritical > 3) throw new Error(`critical document severity budget exceeded: ${totalCritical}`);
  }
}
