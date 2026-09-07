import { PageHeader } from '@jad/ui';

import styles from './PlaceholderPage.module.css';

interface PlaceholderPageProps {
  title: string;
}

/** Shell for approved member sections not yet implemented (F0). */
export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <section>
      <PageHeader title={title} />
      <div className={styles.body}>
        <p>
          This section is part of the approved member navigation. Its content arrives with the JAD
          backend — the shell is ready.
        </p>
      </div>
    </section>
  );
}
