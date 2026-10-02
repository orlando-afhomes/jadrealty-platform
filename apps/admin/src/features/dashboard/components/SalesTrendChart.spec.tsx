import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { SalesTrendChart, centerTrendSeries } from './SalesTrendChart';

/**
 * jsdom has no ResizeObserver; recharts ResponsiveContainer needs one. The
 * stub reports a fixed 800x280 viewport on observe so the chart renders
 * synchronously enough for assertions.
 */
class ResizeObserverStub {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe = () => {
    this.cb(
      [
        {
          target: { clientWidth: 800, clientHeight: 280 } as unknown as Element,
          contentRect: { width: 800, height: 280 } as unknown as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  };
  unobserve = () => {};
  disconnect = () => {};
}

const g = globalThis as unknown as { ResizeObserver?: unknown };

describe('SalesTrendChart', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    server = installMockApi();
    server.install();
    g.ResizeObserver = g.ResizeObserver ?? ResizeObserverStub;
  });

  afterEach(() => {
    server.restore();
    vi.restoreAllMocks();
  });

  it('renders the chart with KPIs and toggle controls', async () => {
    const { container } = renderWithProviders(<SalesTrendChart />, { user: MOCK_ADMIN });
    expect(screen.getByText('Sales Overview')).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector('svg.recharts-surface')).not.toBeNull();
    });
    expect(screen.getByText('Value this month')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Monthly' })[0]).toBeInTheDocument();
  });

  it('switches granularity to yearly and refetches the series', async () => {
    const { container } = renderWithProviders(<SalesTrendChart />, { user: MOCK_ADMIN });
    await waitFor(() => {
      expect(container.querySelector('svg.recharts-surface')).not.toBeNull();
    });
    const before = container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick').length;
    const yearlyButtons = screen.getAllByRole('button', { name: 'Yearly' });
    fireEvent.click(yearlyButtons[0]!);
    await waitFor(() => {
      // Mock sales all fall in the current year -> single yearly bucket,
      // whereas the month view renders 12 monthly ticks.
      const ticks = container.querySelectorAll(
        '.recharts-xAxis .recharts-cartesian-axis-tick',
      ).length;
      expect(ticks).toBe(1);
      expect(screen.getByText(`Value in ${new Date().getUTCFullYear()}`)).toBeInTheDocument();
    });
    expect(before).toBeGreaterThan(0);
  });

  it('renders the centered monthly window (history plus mirrored upcoming slots)', async () => {
    const { container } = renderWithProviders(<SalesTrendChart />, { user: MOCK_ADMIN });
    await waitFor(() => {
      expect(container.querySelector('svg.recharts-surface')).not.toBeNull();
    });

    // 7 trailing real months + 6 upcoming gaps (was a flat 12 before
    // centering). jsdom never fills tick text, so the slot count is the
    // wiring proof - exact positions are covered by the unit tests below.
    await waitFor(() => {
      expect(
        container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick').length,
      ).toBe(13);
    });
  });
});

describe('centerTrendSeries', () => {
  const months = (from: string, count: number): { key: string; count: number; total: string }[] => {
    const out: { key: string; count: number; total: string }[] = [];
    const parts = from.split('-').map(Number);
    const y = parts[0] as number;
    const m = parts[1] as number;
    for (let i = 0; i < count; i++) {
      const total = (y * 12 + (m - 1) + i);
      const year = Math.floor(total / 12);
      const month = (total % 12) + 1;
      out.push({
        key: `${year}-${String(month).padStart(2, '0')}`,
        count: i + 1,
        total: `${(i + 1) * 100}.00`,
      });
    }
    return out;
  };

  it('centers the latest month with a mirrored run of upcoming gaps', () => {
    const series = centerTrendSeries(months('2026-01', 12), 'month', 'value');

    // 7 real + 6 upcoming: the current month sits exactly in the middle.
    expect(series).toHaveLength(13);
    expect(series[6]).toMatchObject({ key: '2026-12', upcoming: false });
    expect(series.slice(0, 7).every((p) => !p.upcoming)).toBe(true);
    expect(series.slice(7).map((p) => p.key)).toEqual([
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
    ]);
    expect(series.slice(7).every((p) => p.upcoming && p.plot === null)).toBe(true);
    expect(series[6]?.plot).toBe(1200);
  });

  it('uses the count metric for plots when selected', () => {
    const series = centerTrendSeries(months('2026-01', 12), 'month', 'count');
    expect(series[6]?.plot).toBe(12);
  });

  it('centers the latest year with mirrored upcoming years', () => {
    const series = centerTrendSeries(
      ['2023', '2024', '2025', '2026'].map((key, i) => ({ key, count: i + 1, total: '0.00' })),
      'year',
      'value',
    );

    expect(series).toHaveLength(7);
    expect(series[3]).toMatchObject({ key: '2026', upcoming: false });
    expect(series.slice(4).map((p) => p.key)).toEqual(['2027', '2028', '2029']);
  });

  it('mirrors shorter histories and tolerates empty input', () => {
    const short = centerTrendSeries(months('2026-11', 2), 'month', 'value');
    expect(short).toHaveLength(3);
    expect(short[1]).toMatchObject({ key: '2026-12', upcoming: false });
    expect(short[2]).toMatchObject({ key: '2027-01', upcoming: true });

    expect(centerTrendSeries([], 'month', 'value')).toEqual([]);
  });

  it('keeps real data only when the last key is malformed', () => {
    const series = centerTrendSeries([{ key: 'bogus', count: 1, total: '1.00' }], 'month', 'value');
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ upcoming: false });
  });
});
