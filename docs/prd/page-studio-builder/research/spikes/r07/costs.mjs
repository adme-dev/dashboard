// USD list-price estimates, checked 2026-09-18. Account/month totals only.
// No taxes, discounts, FX, retail margin, or unlisted products. See R07 report.
const excess = (usage, included) => {
  if (!Number.isFinite(usage) || usage < 0) throw new Error('invalid_usage');
  return Math.max(0, usage - included);
};
const dollars = value => Math.round(value * 1e6) / 1e6;
export const workers = ({ requests, cpuMs }) => dollars(5 + excess(requests, 10e6) / 1e6 * 0.30 + excess(cpuMs, 30e6) / 1e6 * 0.02);
export const platforms = ({ requests, cpuMs, scripts }) => dollars(25 + excess(requests, 20e6) / 1e6 * 0.30 + excess(cpuMs, 60e6) / 1e6 * 0.02 + excess(scripts, 1000) * 0.02);
// Input must already exclude provider-included usage. The published monthly
// unique-worker inclusion cannot safely be subtracted from aggregate worker-days.
export const dynamicIdentities = billableWorkerDays => dollars(excess(billableWorkerDays, 0) * 0.002);
export const r2 = ({ gbMonths, classA, classB }) => dollars(Math.ceil(excess(gbMonths, 10)) * 0.015 + Math.ceil(excess(classA, 1e6) / 1e6) * 4.50 + Math.ceil(excess(classB, 10e6) / 1e6) * 0.36);
export const d1 = ({ reads, writes, gbMonths }) => dollars(excess(reads, 25e9) / 1e6 * 0.001 + excess(writes, 50e6) / 1e6 + excess(gbMonths, 5) * 0.75);
