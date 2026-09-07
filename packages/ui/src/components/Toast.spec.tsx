import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from '../index';

function Harness() {
  const { toast } = useToast();
  return (
    <button onClick={() => toast({ title: 'Saved', message: 'Changes stored.', tone: 'success' })}>
      Save
    </button>
  );
}

function AutoHarness() {
  const { toast } = useToast();
  useEffect(() => {
    toast({ title: 'Saved', tone: 'success' });
  }, [toast]);
  return null;
}

describe('ToastProvider / useToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders toasts inside a polite live region', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Changes stored.')).toBeInTheDocument();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('auto-dismisses after the default duration', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <AutoHarness />
      </ToastProvider>,
    );
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('dismisses via the close button', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});
