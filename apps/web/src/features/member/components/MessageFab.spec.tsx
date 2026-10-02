import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_MEMBER, setMockSessionUser } from '@jad/mock';
import { createMemberMockServer } from '../../../mock';

import { MessageFab } from './MessageFab';
import { renderMember } from '../test/utils';

describe('member MessageFab chat popup', () => {
  let server: ReturnType<typeof createMemberMockServer>;

  beforeEach(() => {
    server = createMemberMockServer();
    server.install();
    setMockSessionUser(MOCK_MEMBER);
  });

  afterEach(() => {
    server.restore();
    setMockSessionUser(null);
  });

  it('renders a toggle button, not a navigating link', async () => {
    renderMember(
      <>
        <span>stay-marker</span>
        <MessageFab />
      </>,
      { user: MOCK_MEMBER, route: '/member' },
    );

    const fab = await screen.findByRole('button', { name: /Messages/ });
    expect(fab.tagName).toBe('BUTTON');
    expect(fab).not.toHaveAttribute('href');
    expect(fab).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens an in-place chat panel with the thread and composer, without navigating', async () => {
    const user = userEvent.setup();
    renderMember(
      <>
        <span>stay-marker</span>
        <MessageFab />
      </>,
      { user: MOCK_MEMBER, route: '/member' },
    );

    await user.click(await screen.findByRole('button', { name: /Messages/ }));

    const dialog = await screen.findByRole('dialog', { name: /Chat with/ });
    expect(
      await within(dialog).findByText('Hello, I have a question about my commission.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('New message')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeInTheDocument();
    // Still on the same page - the FAB never routes to /member/messages.
    expect(screen.getByText('stay-marker')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Messages/ }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('sends a message from the panel and clears the composer', async () => {
    const user = userEvent.setup();
    renderMember(<MessageFab />, { user: MOCK_MEMBER, route: '/member' });

    await user.click(await screen.findByRole('button', { name: /Messages/ }));
    const dialog = await screen.findByRole('dialog', { name: /Chat with/ });

    const input = within(dialog).getByLabelText('New message');
    await user.type(input, 'Panel hello!');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(within(dialog).getByText('Panel hello!')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  it('closes the panel via the close button and Escape, without navigating', async () => {
    const user = userEvent.setup();
    renderMember(
      <>
        <span>stay-marker</span>
        <MessageFab />
      </>,
      { user: MOCK_MEMBER, route: '/member' },
    );

    await user.click(await screen.findByRole('button', { name: /Messages/ }));
    await screen.findByRole('dialog', { name: /Chat with/ });

    await user.click(screen.getByRole('button', { name: 'Close chat' }));
    expect(screen.queryByRole('dialog', { name: /Chat with/ })).not.toBeInTheDocument();
    expect(screen.getByText('stay-marker')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /Messages/ }));
    await screen.findByRole('dialog', { name: /Chat with/ });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /Chat with/ })).not.toBeInTheDocument();
    expect(screen.getByText('stay-marker')).toBeInTheDocument();
  });

  it('stays hidden on the messages page itself', () => {
    renderMember(<MessageFab />, { user: MOCK_MEMBER, route: '/member/messages' });

    expect(screen.queryByRole('button', { name: /Messages/ })).toBeNull();
  });

  it('shows a compact composer without the hint/counter footer and the short team note', async () => {
    const user = userEvent.setup();
    renderMember(<MessageFab />, { user: MOCK_MEMBER, route: '/member' });

    await user.click(await screen.findByRole('button', { name: /Messages/ }));
    const dialog = await screen.findByRole('dialog', { name: /Chat with/ });

    expect(within(dialog).queryByText(/Enter to send/)).toBeNull();
    expect(within(dialog).queryByText(/\/4000/)).toBeNull();
    expect(within(dialog).getByText('Support from the JA&D admin team.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/replies arrive right here/)).toBeNull();
  });

  it('uses the short "Write a message…" placeholder in the panel composer', async () => {
    const user = userEvent.setup();
    renderMember(<MessageFab />, { user: MOCK_MEMBER, route: '/member' });

    await user.click(await screen.findByRole('button', { name: /Messages/ }));
    const dialog = await screen.findByRole('dialog', { name: /Chat with/ });

    expect(within(dialog).getByLabelText('New message')).toHaveAttribute(
      'placeholder',
      'Write a message…',
    );
  });

  it('ships a fixed, responsive chat panel stylesheet', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/features/member/components/MessageChatPanel.module.css'),
      'utf8',
    );
    expect(css).toContain('position: fixed');
    expect(css).toContain('@media');
  });

  it('renders the composer input at the same height as the Send button', async () => {
    const user = userEvent.setup();
    renderMember(<MessageFab />, { user: MOCK_MEMBER, route: '/member' });

    await user.click(await screen.findByRole('button', { name: /Messages/ }));
    const dialog = await screen.findByRole('dialog', { name: /Chat with/ });

    // Single-row input sharing the action-row height (no tall textarea).
    const input = within(dialog).getByLabelText('New message') as HTMLTextAreaElement;
    expect(input.rows).toBe(1);

    const composerCss = readFileSync(
      join(process.cwd(), 'src/features/member/components/MessageComposer.module.css'),
      'utf8',
    );
    expect(composerCss).toMatch(/\.composerInput\s*\{[^}]*min-height:\s*44px/);
  });

  it('ships non-clipping panel styles (thread shrinks, composer capped)', () => {
    const panelCss = readFileSync(
      join(process.cwd(), 'src/features/member/components/MessageChatPanel.module.css'),
      'utf8',
    );
    // The thread row must be allowed to shrink below its content so the
    // panel never grows past its max-height on short screens.
    expect(panelCss).toMatch(/\.threadSize\s*\{[^}]*min-height:\s*0/);
    expect(panelCss).not.toMatch(/\.threadSize\s*\{[^}]*min-height:\s*200px/);

    const composerCss = readFileSync(
      join(process.cwd(), 'src/features/member/components/MessageComposer.module.css'),
      'utf8',
    );
    // The textarea must not be resizable past the panel in compact mode.
    expect(composerCss).toMatch(/\.composerCompact[^{]*\{[^}]*resize:\s*none/);
    expect(composerCss).toMatch(/\.composerCompact[^{]*\{[^}]*max-height/);
  });

  it('ships viewport-unit fallbacks and minimum containment for the panel', () => {
    const panelCss = readFileSync(
      join(process.cwd(), 'src/features/member/components/MessageChatPanel.module.css'),
      'utf8',
    );
    // Where env()/dvh are unsupported the whole declaration is dropped, so
    // plain fallbacks must come first (bottom anchoring + height cap).
    expect(panelCss).toMatch(/bottom:\s*136px/);
    expect(panelCss).toMatch(/max-height:\s*560px/);
    expect(panelCss).toMatch(/100vh/);
    // Every direct grid child must be shrinkable past its content width.
    expect(panelCss).toMatch(/\.panel\s*>\s*\*[^{]*\{[^}]*min-width:\s*0/);

    const threadCss = readFileSync(
      join(process.cwd(), 'src/features/member/components/MessageThread.module.css'),
      'utf8',
    );
    // Bubbles/rows/senders must wrap instead of forcing horizontal overflow.
    expect(threadCss).toMatch(/\.row\s*\{[^}]*min-width:\s*0/);
    expect(threadCss).toMatch(/\.bubble\s*\{[^}]*min-width:\s*0/);
    expect(threadCss).toMatch(/\.sender\s*\{[^}]*overflow-wrap/);
  });
});
