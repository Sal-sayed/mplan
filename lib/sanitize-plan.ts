/* eslint-disable @typescript-eslint/no-explicit-any */

const BLOCKED_KPI_PATTERNS = [
  /customer\s*acquisition/i,
  /\bcac\b/i,
  /cost\s*per\s*acquisition/i,
  /acquisition\s*cost/i,
];

export function sanitizePlan(plan: any): any {
  if (!plan) return plan;

  // Filter the KPIs array
  if (Array.isArray(plan.kpis)) {
    plan.kpis = plan.kpis.filter((kpi: any) => {
      const haystack = `${kpi.name || ''} ${kpi.formula || ''} ${kpi.description || ''} ${kpi.category || ''} ${kpi.id || ''}`;
      return !BLOCKED_KPI_PATTERNS.some(re => re.test(haystack));
    });
  }

  // Remove acquisition references from business objectives' related KPIs
  if (Array.isArray(plan.businessObjectives)) {
    const validKpiIds = new Set((plan.kpis || []).map((k: any) => k.id));
    plan.businessObjectives.forEach((obj: any) => {
      if (Array.isArray(obj.relatedKpis)) {
        obj.relatedKpis = obj.relatedKpis.filter((id: string) => validKpiIds.has(id));
      }
    });
  }

  return plan;
}
