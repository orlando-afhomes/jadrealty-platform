import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../index';

function Harness({
  danger = false,
  onConfirm,
  onCancel,
}: {
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Reject</button>
      <ConfirmDialog
        open={open}
        danger={danger}
        title="Reject registration"
        message="This cannot be undone."
        confirmLabel="Reject registration"
        cancelLabel="Keep pending"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </>
  );
}

describe('ConfirmDialog', () => {
  it('calls onConfirm and onCancel', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Reject registration' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Keep pending' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses the danger tone for destructive confirmations', async () => {
    const user = userEvent.setup();
    render(<Harness danger onConfirm={() => {}} onCancel={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByRole('button', { name: 'Reject registration' }).className).toContain(
      'danger',
    );
  });
});
