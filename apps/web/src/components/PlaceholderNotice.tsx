import type { ReactNode } from 'react';

import { Alert } from './Alert';

export interface PlaceholderNoticeProps {
  children: ReactNode;
}

/**
 * Clearly-identifiable temporary content marker. Rendered wherever the public
 * website displays content that is NOT yet defined in the SSOT (approved copy,
 * business data, or an approved endpoint). These notices are intentional — the
 * project rule is to flag missing information, never to invent business facts.
 */
export function PlaceholderNotice({ children }: PlaceholderNoticeProps) {
  return (
    <Alert variant="info" title="Placeholder content — pending approval">
      {children}
    </Alert>
  );
}
