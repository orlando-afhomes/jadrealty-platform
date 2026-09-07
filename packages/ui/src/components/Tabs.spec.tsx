import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Tabs } from '../index';

function setup() {
  const onChange = vi.fn();
  const items = [
    { value: 'available', label: 'Available' },
    { value: 'pending', label: 'Pending' },
    { value: 'history', label: 'History' },
  ];
  render(
    <Tabs items={items} value="available" onChange={onChange} baseId="ledger" ariaLabel="Ledger" />,
  );
  return { onChange };
}

describe('Tabs', () => {
  it('marks the selected tab and wires aria-controls', () => {
    setup();
    const available = screen.getByRole('tab', { name: 'Available' });
    expect(available).toHaveAttribute('aria-selected', 'true');
    expect(available).toHaveAttribute('aria-controls', 'ledger-available-panel');
    expect(screen.getByRole('tab', { name: 'Pending' })).toHaveAttribute('aria-selected', 'false');
  });

  it('moves selection with arrow keys', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const available = screen.getByRole('tab', { name: 'Available' });
    available.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('pending');
    expect(screen.getByRole('tab', { name: 'Pending' })).toHaveFocus();
  });

  it('moves selection on click', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(onChange).toHaveBeenCalledWith('history');
  });
});
