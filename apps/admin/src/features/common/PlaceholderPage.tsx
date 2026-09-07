import { PageHeader } from '@jad/ui';
import { Link } from 'react-router';

import styles from './PlaceholderPage.module.css';

interface PlaceholderPageProps {
  title: string;
}

/** Shell for approved admin sections not yet implemented (F0). */
export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <section>
      <PageHeader title={title} />
      <div className={styles.body}>
        <p>
          This section is part of the approved admin navigation. Its data and workflows arrive with
          the JAD backend — the shell and access controls are ready.
        </p>
        <Link className={styles.link} to="/admin">
          Back to Dashboard
        </Link>
      </div>
    </section>
  );
}
