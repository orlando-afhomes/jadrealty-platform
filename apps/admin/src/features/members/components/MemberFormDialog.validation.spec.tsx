import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MOCK_ADMIN } from '@jad/mock';

import { installMockApi, renderWithProviders } from '../../../test/utils';
import { resetRegistrationStore, registrationStore } from '../../../mock/registrationMockStore';
import { MemberFormDialog } from './MemberFormDialog';

describe('MemberFormDialog validation (register parity)', () => {
  let server: ReturnType<typeof installMockApi>;

  beforeEach(() => {
    resetRegistrationStore();
    server = installMockApi();
    server.install();
  });

  afterEach(() => {
    server.restore();
  });

  function openCreate(onClose: () => void = () => {}) {
    renderWithProviders(<MemberFormDialog open onClose={onClose} member={null} />, {
      user: MOCK_ADMIN,
    });
  }

  async function fillValidBasics(suffix: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('First Name'), 'Juan');
    await user.type(screen.getByLabelText('Middle Initial'), 'd');
    await user.type(screen.getByLabelText('Last Name'), 'Dela Cruz');
    await user.type(screen.getByLabelText('Email'), `new.member.${suffix}@example.com`);
    await user.type(screen.getByLabelText('Temporary Password'), 'password123');
    await user.selectOptions(screen.getByLabelText('Gender'), 'Male');
    return user;
  }

  function combo(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing combobox #${id}`);
    return el;
  }

  async function pickLocation() {
    const user = userEvent.setup();
    // Province combobox: focus clears, type filters, click commits.
    const province = combo('member-provinceCode');
    await user.click(province);
    await user.type(province, 'Ilocos');
    await user.click(await screen.findByRole('option', { name: 'Ilocos Norte' }));
    // City unlocks once the province commits.
    const city = combo('member-cityCode');
    await user.click(city);
    await user.type(city, 'Laoag');
    await user.click(await screen.findByRole('option', { name: 'Laoag City' }));
    // Barangay unlocks once the city commits.
    const barangay = combo('member-barangayCode');
    await user.click(barangay);
    await user.type(barangay, 'Brgy 1');
    await user.click(await screen.findByRole('option', { name: 'Brgy 1' }));
    return user;
  }

  it('renders the middle-initial field with an N/A choice', async () => {
    openCreate();
    expect(await screen.findByLabelText('Middle Initial')).toBeInTheDocument();
    expect(screen.getByLabelText('N/A')).toBeInTheDocument();
  });

  it('keeps only one uppercase letter in the middle initial', async () => {
    openCreate();
    const user = userEvent.setup();
    const input = await screen.findByLabelText('Middle Initial');
    await user.type(input, 'ab1.');
    expect(input).toHaveValue('A');
  });

  it('disables the initial and skips the requirement under N/A', async () => {
    openCreate();
    const user = userEvent.setup();
    const input = (await screen.findByLabelText('Middle Initial')) as HTMLInputElement;
    await user.click(screen.getByLabelText('N/A'));
    expect(input.disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Create member' }));
    // No middle-initial complaint while other errors may show.
    await waitFor(() => expect(screen.getByLabelText('First Name')).toBeInTheDocument());
    expect(screen.queryByText('Enter the middle initial or select N/A.')).not.toBeInTheDocument();
  });

  it('title-cases names live while typing (no capslock toggling needed)', async () => {
    openCreate();
    const user = userEvent.setup();
    const first = await screen.findByLabelText('First Name');
    await user.type(first, 'ju4an');
    // Digits never enter state and the first letter capitalizes immediately.
    expect(first).toHaveValue('Juan');
    const last = screen.getByLabelText('Last Name');
    await user.type(last, 'dela cruz');
    // Every word boundary capitalizes as typed.
    expect(last).toHaveValue('Dela Cruz');
  });

  it('forces lowercase email live, even with capslock on', async () => {
    openCreate();
    const email = (await screen.findByLabelText('Email')) as HTMLInputElement;
    // Simulates capslock input arriving in one event (paste/autofill path).
    fireEvent.change(email, { target: { value: 'JUAN.DELACRUZ@EXAMPLE.COM' } });
    expect(email.value).toBe('juan.delacruz@example.com');
  });

  it('styles the birthday picker, gender and phone dropdowns with the polished controls', async () => {
    openCreate();
    const dob = await screen.findByLabelText('Date of Birth');
    expect(dob.className).toMatch(/control/);
    expect(dob.className).toMatch(/date/);
    expect(screen.getByLabelText('Gender').className).toMatch(/select/);
    expect(await screen.findByText('+63 - 10 digits')).toBeInTheDocument();
    expect(screen.getByLabelText('Country code').className).toMatch(/select/);
  });

  it('rejects malformed emails on blur', async () => {
    openCreate();
    const user = userEvent.setup();
    const email = await screen.findByLabelText('Email');
    await user.type(email, 'not-an-email');
    fireEvent.blur(email);
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  });

  it('caps the password at 72 characters and rejects short values on submit', async () => {
    openCreate();
    const password = (await screen.findByLabelText('Temporary Password')) as HTMLInputElement;
    expect(password.maxLength).toBe(72);
    const user = userEvent.setup();
    await user.type(password, 'short');
    await user.click(screen.getByRole('button', { name: 'Create member' }));
    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
  });

  it('defaults the dial to the PH rule, strips letters, and rejects bad numbers', async () => {
    openCreate();
    // Verified-country dial follows once public config loads.
    expect(await screen.findByText('+63 - 10 digits')).toBeInTheDocument();
    const user = userEvent.setup();
    const phone = screen.getByLabelText('Phone number');
    await user.type(phone, '09ab17');
    expect(phone).toHaveValue('0917');
    await user.clear(phone);
    await user.type(phone, '812345678');
    await user.click(screen.getByRole('button', { name: 'Create member' }));
    expect(
      await screen.findByText('Enter a valid phone number for the selected country code.'),
    ).toBeInTheDocument();
  });

  it('normalizes a pasted full international number on submit', async () => {
    openCreate();
    expect(await screen.findByText('+63 - 10 digits')).toBeInTheDocument();
    const phone = screen.getByLabelText('Phone number') as HTMLInputElement;
    // Paste/autofill delivers the whole value in one event - the embedded
    // dial prefix is stripped (overflow proves it rode along).
    fireEvent.change(phone, { target: { value: '+639171234567' } });
    expect(phone.value).toBe('9171234567');
  });

  it('rejects today as the date of birth', async () => {
    openCreate();
    const today = new Date().toISOString().slice(0, 10);
    const dob = (await screen.findByLabelText('Date of Birth')) as HTMLInputElement;
    fireEvent.change(dob, { target: { value: today } });
    fireEvent.blur(dob);
    expect(await screen.findByText('Enter a valid date of birth.')).toBeInTheDocument();
  });

  it('requires the full PH hierarchy before submit', async () => {
    openCreate();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create member' }));
    expect(await screen.findByText('Select a province.')).toBeInTheDocument();
  });

  it('requires region + city text for non-PH countries', async () => {
    openCreate();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Country'), 'US');
    await user.click(screen.getByRole('button', { name: 'Create member' }));
    expect(await screen.findByText('Region/state is required.')).toBeInTheDocument();
    expect(await screen.findByText('City is required.')).toBeInTheDocument();
  });

  it('creates the member with normalized values on a valid submit', async () => {
    const onClose = vi.fn();
    renderWithProviders(<MemberFormDialog open onClose={onClose} member={null} />, {
      user: MOCK_ADMIN,
    });
    const before = registrationStore.members.length;
    await fillValidBasics('valid');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Name Suffix'), 'Jr.');
    // National number with spaces normalizes to E.164 on submit.
    const phone = screen.getByLabelText('Phone number');
    await user.clear(phone);
    await user.type(phone, '917 123 4567');
    fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: '1992-03-14' } });
    await user.type(screen.getByLabelText('Street Address'), '123 Mabini St');
    await pickLocation();
    await user.click(screen.getByRole('button', { name: 'Create member' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(registrationStore.members.length).toBe(before + 1);
    const created = registrationStore.members[registrationStore.members.length - 1]!;
    expect(created.phone).toBe('+639171234567');
    expect(created.memberCode).toMatch(/^JAD-MEM-[0-9]{4,}$/);
    expect(created.firstName).toBe('Juan');
    expect(created.nameSuffix).toBe('Jr.');
  });

  it('hides city/barangay until a province is picked', async () => {
    openCreate();
    await screen.findByLabelText('First Name');
    expect(document.getElementById('member-cityCode')).toBeNull();
    expect(document.getElementById('member-barangayCode')).toBeNull();
    const user = userEvent.setup();
    const province = document.getElementById('member-provinceCode')!;
    await user.click(province);
    await user.type(province, 'Ilocos');
    await user.click(await screen.findByRole('option', { name: 'Ilocos Norte' }));
    expect(document.getElementById('member-cityCode')).not.toBeNull();
    expect(document.getElementById('member-barangayCode')).toBeNull();
  });

  it('offers only the fixed suffix choices in a dropdown', async () => {
    openCreate();
    const suffix = screen.getByLabelText('Name Suffix') as HTMLSelectElement;
    expect(Array.from(suffix.options).map((o) => o.value)).toEqual([
      '',
      'Jr.',
      'Sr.',
      'II',
      'III',
      'IV',
      'V',
    ]);
  });

  it('submits on Enter inside a text field (native form semantics)', async () => {
    openCreate();
    const first = await screen.findByLabelText('First Name');
    await userEvent.type(first, '{enter}');
    // Empty submit surfaces validation instead of doing nothing.
    expect(await screen.findByText('First name is required.')).toBeInTheDocument();
  });

  it('marks required controls programmatically, not just visually', async () => {
    openCreate();
    await screen.findByLabelText('First Name');
    for (const label of [
      'First Name',
      'Last Name',
      'Email',
      'Temporary Password',
      'Phone number',
      'Date of Birth',
      'Gender',
      'Country',
      'Street Address',
    ]) {
      expect(screen.getByLabelText(label).getAttribute('aria-required')).toBe('true');
    }
  });

  it('announces the highlighted location option via aria-activedescendant', async () => {
    openCreate();
    const province = document.getElementById('member-provinceCode')!;
    await userEvent.click(province);
    await userEvent.keyboard('{ArrowDown}');
    expect(province.getAttribute('aria-activedescendant')).toBe('member-provinceCode-option-1');
  });

  it('prefills edit mode with the split phone and stored initial', async () => {
    const target = {
      ...registrationStore.members[0]!,
      phone: '+639171234567',
      middleInitial: 'D',
    };
    renderWithProviders(<MemberFormDialog open onClose={() => {}} member={target} />, {
      user: MOCK_ADMIN,
    });
    expect(await screen.findByText('+63 - 10 digits')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toHaveValue('9171234567');
    expect(screen.getByLabelText('Middle Initial')).toHaveValue('D');
    expect(screen.getByLabelText('Country')).toBeDisabled();
  });
});
