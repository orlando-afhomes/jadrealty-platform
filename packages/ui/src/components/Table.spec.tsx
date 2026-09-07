import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  EmptyRow,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../index';

describe('Table primitives', () => {
  it('renders a caption, column headers, and labelled cells', () => {
    render(
      <Table>
        <TableCaption>Pending registrations</TableCaption>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Name</TableHeaderCell>
            <TableHeaderCell align="right">Amount</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell label="Name">Juan Dela Cruz</TableCell>
            <TableCell label="Amount" align="right">
              1,000.00
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Pending registrations')).toBeInTheDocument();
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    expect(nameHeader).toHaveAttribute('scope', 'col');
    expect(screen.getByText('Juan Dela Cruz')).toHaveAttribute('data-label', 'Name');
    expect(screen.getByText('1,000.00')).toHaveAttribute('data-label', 'Amount');
  });

  it('renders a spanned empty row', () => {
    render(
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Name</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <EmptyRow columns={1}>Nothing here</EmptyRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Nothing here').getAttribute('colspan')).toBe('1');
  });
});
