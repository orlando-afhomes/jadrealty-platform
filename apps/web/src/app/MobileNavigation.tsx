import { ButtonLink } from '../components/ButtonLink';
import { PublicNavLink } from '../components/PublicNavLink';

import type { NavItem } from '../features/public/content/types';
import styles from './MobileNavigation.module.css';

export interface MobileNavigationProps {
  items: NavItem[];
  /** Member auth actions (Login/Register) — rendered after the page links. */
  authItems?: NavItem[];
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.link} ${styles.active}` : styles.link;

/**
 * Responsive primary navigation (UI-UX §4.6 / §11.3).
 *
 * A single `nav#primary-nav` is shared across breakpoints: collapsed below
 * 640px and driven by the `.navOpen` CSS-module class, always visible above
 * 640px regardless of toggle state. The toggle button exposes `aria-expanded`
 * and `aria-controls` for assistive tech. The `.navOpen` class is the contract
 * the regression tests assert (jsdom cannot compute stylesheet layout).
 */
export function MobileNavigation({
  items,
  authItems,
  open,
  onToggle,
  onNavigate,
}: MobileNavigationProps) {
  return (
    <>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls="primary-nav"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        onClick={onToggle}
      >
        <span className={styles.toggleIcon} aria-hidden="true" />
      </button>
      <nav
        id="primary-nav"
        aria-label="Primary"
        className={`${styles.nav} ${open ? styles.navOpen : ''}`}
      >
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.to}>
              <PublicNavLink
                to={item.to}
                className={navLinkClass}
                end={item.to === '/'}
                onClick={onNavigate}
              >
                {item.label}
              </PublicNavLink>
            </li>
          ))}
        </ul>
        {authItems?.length ? (
          <div className={styles.authGroup}>
            {authItems.map((item) => (
              <ButtonLink
                key={item.to}
                to={item.to}
                variant={item.to === '/register' ? 'light' : 'outlineLight'}
                className={styles.authLink}
                onClick={onNavigate}
              >
                {item.label}
              </ButtonLink>
            ))}
          </div>
        ) : null}
      </nav>
    </>
  );
}
