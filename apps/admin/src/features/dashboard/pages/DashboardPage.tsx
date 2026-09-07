import type { AdminQueues } from '@jad/contracts';
import { EmptyState, ErrorState, Icon, PageHeader, Skeleton, StatusChip } from '@jad/ui';
import { Link } from 'react-router';

import { canAccess, findNavItem, ROLE_LABELS } from '../../../app/navigation';
import { useSession } from '../../../lib/session';
import { useAdminQueues } from '../hooks/useAdminQueues';
import styles from './DashboardPage.module.css';

const QUEUE_LINKS: {
  to: string;
  label: string;
  key: keyof AdminQueues;
  icon: 'user' | 'check' | 'wallet' | 'list';
  description: string;
}[] = [
  {
    to: '/admin/registrations',
    label: 'Registrations',
    key: 'registrations',
    icon: 'user',
    description: 'New member applications awaiting review',
  },
  {
    to: '/admin/sales',
    label: 'Sales',
    key: 'sales',
    icon: 'check',
    description: 'Sales submissions and approvals',
  },
  {
    to: '/admin/payouts',
    label: 'Payouts',
    key: 'payouts',
    icon: 'wallet',
    description: 'Payout accounts pending verification',
  },
  {
    to: '/admin/withdrawals',
    label: 'Withdrawals',
    key: 'withdrawals',
    icon: 'list',
    description: 'Withdrawal requests to process',
  },
];

/** Dashboard queue card — professional SaaS style with icon, count, and navigation. */
function QueueCard({
  to,
  label,
  icon,
  description,
  data,
}: {
  to: string;
  label: string;
  icon: 'user' | 'check' | 'wallet' | 'list';
  description: string;
  data: number | undefined;
}) {
  const count = data ?? 0;
  const hasItems = count > 0;
  return (
    <Link className={styles.card} to={to} aria-label={`${label}: ${count} pending`}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <Icon name={icon} size={20} />
        </span>
        <StatusChip
          label={hasItems ? 'action needed' : 'clear'}
          tone={hasItems ? 'warning' : 'success'}
        />
      </div>
      <span className={styles.count}>{count}</span>
      <span className={styles.label}>{label}</span>
      <span className={styles.description}>{description}</span>
    </Link>
  );
}

/** Dashboard (queues) — pending-action counts per queue the role may access. */
export function DashboardPage() {
  const { role } = useSession();
  const { data, isPending, isError, error, refetch } = useAdminQueues();

  const baseVisible = QUEUE_LINKS.filter((queue) => {
    const item = findNavItem(queue.to);
    return item === undefined || canAccess(role, item);
  });

  // Q2: action needed first
  const visible = [...baseVisible].sort((a, b) => (data?.[b.key] ?? 0) - (data?.[a.key] ?? 0));

  const sum = visible.reduce((s, q) => s + (data?.[q.key] ?? 0), 0);
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : null;
  const description =
    !isPending && data && roleLabel
      ? `Welcome back, ${roleLabel} — ${sum} pending`
      : 'Pending action queues for your role';
  const allClear =
    !isPending &&
    !isError &&
    visible.length > 0 &&
    visible.every((q) => (data?.[q.key] ?? 0) === 0);

  return (
    <section>
      <PageHeader title="Dashboard" description={description} />
      <p className={styles.timeframe}>As of today</p>
      {isPending ? (
        <ul className={styles.queues} role="status" aria-live="polite" aria-busy="true">
          {visible.map((queue) => (
            <li key={queue.to}>
              <Skeleton className={styles.card} />
            </li>
          ))}
        </ul>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : allClear ? (
        <EmptyState title="All clear" description="No pending items for your role." />
      ) : (
        <ul className={styles.queues}>
          {visible.map((queue) => (
            <li key={queue.to}>
              <QueueCard
                to={queue.to}
                label={queue.label}
                icon={queue.icon}
                description={queue.description}
                data={data?.[queue.key]}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
