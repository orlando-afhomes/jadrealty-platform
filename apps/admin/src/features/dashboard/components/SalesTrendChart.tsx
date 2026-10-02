import { useState } from 'react';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { addMoney, formatMoney } from '@jad/shared';

import { ErrorState, Icon, Spinner } from '@jad/ui';

import { useSalesTrend } from '../hooks/useSalesTrend';
import styles from './SalesTrendChart.module.css';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** `2026-09` -> "Sep '26"; `2026` -> "2026". */
export function periodLabel(key: string): string {
  if (key.length === 4) return key;
  const year = key.slice(0, 4);
  const month = Number(key.slice(5, 7));
  return `${MONTH_LABELS[month - 1] ?? key} '${year.slice(2)}`;
}

/** Axis abbreviation - display geometry only; money math stays string-based. */
function abbreviateMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `₱${Math.round(value / 1_000)}K`;
  return `₱${value}`;
}

type Metric = 'value' | 'count';

/** Real trailing periods kept on either side of the centered latest point. */
export const TREND_HISTORY_PERIODS = 7;

export interface CenteredTrendPoint {
  key: string;
  label: string;
  count: number;
  total: string;
  /** Null for upcoming slots - rendered as an honest gap, never a zero. */
  plot: number | null;
  upcoming: boolean;
}

function shiftMonthKey(key: string, delta: number): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const total = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  if (!Number.isSafeInteger(total) || total < 0) return null;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function shiftYearKey(key: string, delta: number): string | null {
  if (!/^\d{4}$/.test(key)) return null;
  return String(Number(key) + delta);
}

/**
 * Compact centered window: the latest real period always lands in the
 * middle - up to 7 trailing real periods plus a mirrored run of upcoming
 * slots. Upcoming slots carry no data (plot null, rendered as a gap), so
 * the future is never fabricated as zeroes.
 */
export function centerTrendSeries(
  realPoints: { key: string; count: number; total: string }[],
  granularity: 'month' | 'year',
  metric: Metric,
): CenteredTrendPoint[] {
  const windowed = realPoints.slice(-TREND_HISTORY_PERIODS);
  const series: CenteredTrendPoint[] = windowed.map((period) => ({
    key: period.key,
    label: periodLabel(period.key),
    count: period.count,
    total: period.total,
    plot: metric === 'value' ? Number(period.total) : period.count,
    upcoming: false,
  }));
  const lastKey = windowed.at(-1)?.key;
  if (!lastKey) return series;
  const shift = granularity === 'month' ? shiftMonthKey : shiftYearKey;
  for (let i = 1; i <= windowed.length - 1; i++) {
    const key = shift(lastKey, i);
    if (!key) break;
    series.push({ key, label: periodLabel(key), count: 0, total: '0.00', plot: null, upcoming: true });
  }
  return series;
}

interface Kpi {
  label: string;
  value: string;
}

/**
 * Dashboard Sales Overview: line chart of qualifying-sale value or count per
 * month/year with KPI strip. Only QUALIFYING_SALE rows feed the server trend
 * series - submitted/approved-but-unqualified sales are working-pipeline
 * items, not recognized sales. The exact-decimal totals are only converted
 * to Number for SVG geometry.
 */
export function SalesTrendChart() {
  const [granularity, setGranularity] = useState<'month' | 'year'>('month');
  const [metric, setMetric] = useState<Metric>('value');
  const { data, isPending, isError, error, refetch } = useSalesTrend(granularity);

  const points = data?.periods ?? [];
  // KPIs always read the real trailing window; the chart pads it with
  // mirrored upcoming slots so the latest period sits in the middle.
  const realPoints = points.slice(-TREND_HISTORY_PERIODS);
  const series = centerTrendSeries(points, granularity, metric);

  const yearPrefix = String(new Date().getUTCFullYear());
  const yearPeriods = points.filter((p) => p.key.startsWith(yearPrefix));
  let totalThisYear = '0.00';
  for (const period of yearPeriods) totalThisYear = addMoney(totalThisYear, period.total);
  const countThisYear = yearPeriods.reduce((sum, period) => sum + period.count, 0);

  const current = realPoints.at(-1);
  const previous = realPoints.at(-2);
  const kpis: Kpi[] = [
    {
      label: granularity === 'month' ? 'Value this month' : `Value in ${yearPrefix}`,
      value: current ? formatMoney(current.total) : formatMoney('0.00'),
    },
    {
      label: 'Previous period',
      value: previous ? formatMoney(previous.total) : formatMoney('0.00'),
    },
    {
      label: 'Qualifying sales this year',
      value: `${countThisYear} · ${formatMoney(totalThisYear)}`,
    },
  ];

  return (
    <section className={styles.card} aria-label="Sales overview">
      <div className={styles.cardHead}>
        <span className={styles.cardIcon} aria-hidden="true">
          <Icon name="list" size={18} />
        </span>
        <h2 className={styles.cardTitle}>Sales Overview</h2>
        <div className={styles.toggles}>
          <div className={styles.segmented} role="group" aria-label="Chart metric">
            <button
              type="button"
              className={metric === 'value' ? styles.on : ''}
              onClick={() => setMetric('value')}
            >
              Value (₱)
            </button>
            <button
              type="button"
              className={metric === 'count' ? styles.on : ''}
              onClick={() => setMetric('count')}
            >
              Count
            </button>
          </div>
          <div className={styles.segmented} aria-label="Chart granularity">
            <button
              type="button"
              className={granularity === 'month' ? styles.on : ''}
              onClick={() => setGranularity('month')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={granularity === 'year' ? styles.on : ''}
              onClick={() => setGranularity('year')}
            >
              Yearly
            </button>
          </div>
        </div>
      </div>

      <div className={styles.kpis}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className={styles.kpi}>
            <span className={styles.kpiValue}>{kpi.value}</span>
            <span className={styles.kpiLabel}>{kpi.label}</span>
          </div>
        ))}
      </div>

      <div className={styles.chartBox}>
        {isPending ? (
          <div className={styles.chartState} role="status" aria-live="polite">
            <Spinner size="sm" /> Loading trend…
          </div>
        ) : isError ? (
          <div className={styles.chartState}>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </div>
        ) : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-brand-primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-subtle)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border-default)' }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tickFormatter={(v: number) => (metric === 'value' ? abbreviateMoney(v) : String(v))}
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  width={metric === 'value' ? 56 : 32}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--color-border-strong)' }}
                  contentStyle={{
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-default)',
                    fontSize: 12,
                  }}
                  labelFormatter={(label) => String(label)}
                  formatter={(value, _name, item) => {
                    const point = item as
                      | { payload?: { total?: string; count?: number; upcoming?: boolean } }
                      | undefined;
                    if (point?.payload?.upcoming) return ['No data yet', 'Upcoming'];
                    if (point?.payload?.total !== undefined) {
                      return [point.payload.total === undefined ? String(value) : formatMoney(point.payload.total), 'Sales value'];
                    }
                    return [String(value), 'Sales'];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="plot"
                  stroke="none"
                  fill="url(#trendFill)"
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="plot"
                  stroke="var(--color-brand-primary)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--color-brand-primary)' }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
