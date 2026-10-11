import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ listNumbers: vi.fn() }));
vi.mock('./actions', () => mocks);
vi.mock('@tanstack/react-router', () => ({ useRouteContext: () => ({ client: { id: 'own' } }) }));
import { NumbersList } from './list';
describe('numbers refresh', () => {
 it('displays empty state and makes a fresh request when clicked', async () => {
  mocks.listNumbers.mockResolvedValue({ count: 0, page: 1, pageSize: 25, rows: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NumbersList/></QueryClientProvider>);
  await screen.findByText('Você ainda não tem números cadastrados.');
  expect(mocks.listNumbers).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
  await waitFor(() => expect(mocks.listNumbers).toHaveBeenCalledTimes(2));
 });
});
