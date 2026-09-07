import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ContactPage } from './ContactPage';
import { renderWithProviders } from '../../../test/utils';

describe('ContactPage', () => {
  it('renders real contact methods and a presentational message form', () => {
    renderWithProviders(<ContactPage />);

    expect(
      screen.getByRole('heading', { name: /talk with ja&d realty services/i }),
    ).toBeInTheDocument();

    const messenger = screen.getByRole('link', { name: /message us on messenger/i });
    expect(messenger).toHaveAttribute('href', 'https://m.me/JADRealtyServices');
    expect(messenger).toHaveAttribute('target', '_blank');
    expect(messenger).toHaveAttribute('rel', 'noopener noreferrer');

    const phone = screen.getByRole('link', { name: /0965-250-0052/i });
    expect(phone).toHaveAttribute('href', 'tel:+639652500052');

    const email = screen.getByRole('link', { name: /info\.jaandd@gmail\.com/i });
    expect(email).toHaveAttribute('href', 'mailto:info.jaandd@gmail.com');

    expect(screen.getByText(/alaminos commercial complex/i)).toBeInTheDocument();

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Message' })).toBeInTheDocument();
  });

  it('acknowledges without submitting (no navigation, no fake send)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContactPage />);

    await user.click(screen.getByRole('button', { name: 'Send Message' }));

    expect(screen.getByRole('status')).toHaveTextContent('Thank you for reaching out.');
  });
});
