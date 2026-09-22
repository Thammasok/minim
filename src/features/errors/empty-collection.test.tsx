import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyCollection } from './empty-collection';

describe('EmptyCollection', () => {
  // TC-U-087
  it('names the collection so a clean parse is distinguishable from a bug', () => {
    render(<EmptyCollection collectionName="Billing API" />);

    const state = screen.getByTestId('empty-collection');
    expect(state.textContent).toContain('Billing API');
    expect(state.textContent).toContain('has no requests');
    expect(state.textContent).toContain('parsed successfully');
  });

  it('falls back to a neutral subject for an unnamed collection', () => {
    render(<EmptyCollection collectionName="   " />);
    expect(screen.getByTestId('empty-collection').textContent).toContain(
      'This collection has no requests'
    );
  });
});
