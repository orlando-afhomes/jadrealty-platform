import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button, Dialog } from '../index';

function Harness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" ref={triggerRef} onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Approve registration">
        <p>Approve this registration?</p>
        <Button variant="primary">Approve</Button>
        <Button variant="secondary">Hold</Button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('is modal, labelled, and traps focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Approve registration');

    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('wraps Tab focus within the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.tab();
    await user.tab();
    const hold = screen.getByRole('button', { name: 'Hold' });
    expect(hold).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('renders footer actions', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('keeps focus in a parent-owned input while typing (no focus steal on re-render)', async () => {
    function TypingHarness() {
      const [open, setOpen] = useState(false);
      const [value, setValue] = useState('');
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {/* Inline onClose + parent-owned input state mirrors ConfigPage's
              edit dialog: every keystroke re-renders the Dialog owner. */}
          <Dialog open={open} onClose={() => setOpen(false)} title="Edit value">
            <label>
              Value
              <input value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
          </Dialog>
        </>
      );
    }
    const user = userEvent.setup();
    render(<TypingHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    const input = screen.getByRole('textbox', { name: 'Value' });
    await user.click(input);
    await user.type(input, 'abc');

    expect(input).toHaveValue('abc');
    expect(input).toHaveFocus();
  });

  it('moves initial focus to the data-autofocus element when present', async () => {
    function AutofocusHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Edit value">
            <label>
              Value
              <input data-autofocus />
            </label>
          </Dialog>
        </>
      );
    }
    const user = userEvent.setup();
    render(<AutofocusHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveFocus();
  });
});
