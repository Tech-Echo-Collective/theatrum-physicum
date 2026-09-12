import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GenesisApp, WorldBuilder } from '@/components/genesis-app';

function builder() {
  return render(<WorldBuilder locale="en" setLocale={() => {}} />);
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('Genesis and world builder', () => {
  it('opens with only identity, Genesis and the literary adaptation', () => {
    render(<GenesisApp />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Genesis' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Theatrum Physicum' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'In the beginning, you created the heavens and the earth.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Current World')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
  it('Genesis creates the definition and focuses the builder without claiming a runtime', async () => {
    render(<GenesisApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Genesis' }));
    expect(
      screen.getByRole('heading', { name: 'World definition' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Theatrum Physicum' })).toBe(
      document.activeElement,
    );
    for (const name of ['Run', 'Pause', 'Reset'])
      expect(
        (screen.getByRole('button', { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
    expect(screen.getByText('The world is without motion.')).toBeTruthy();
  });
  it('keeps particle edits, initial conditions, stage and interaction summary consistent', async () => {
    builder();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Particle' }));
    const summary = screen.getByRole('region', { name: 'Euclidean · 3+1D' });
    expect(within(summary).getByText('Gravity')).toBeTruthy();
    expect(within(summary).queryByText('Electromagnetism')).toBeNull();
    change('P1 Charge · C', '-1.5');
    expect(within(summary).getByText('Electromagnetism')).toBeTruthy();
    change('P1 Position x', '2');
    change('P1 Velocity y', '4');
    expect(screen.getByText('r₀ = (2, 0, 0) m', { exact: false })).toBeTruthy();
    expect(screen.getByText('P1: (2, 0, 0) m')).toBeTruthy();
    const marker = screen
      .getByRole('img', {
        name: 'Static coordinate preview of particle positions',
      })
      .querySelector('circle');
    expect(marker?.getAttribute('cx')).toBe('468');
    await user.click(
      screen.getByRole('checkbox', {
        name: /Gravity.*Ignore as an approximation/,
      }),
    );
    expect(within(summary).getByText('Gravity · Ignored')).toBeTruthy();
    change('P1 Mass · kg', '0');
    expect(within(summary).queryByText('Gravity · Ignored')).toBeNull();
    change('P1 Mass · kg', '1');
    expect(within(summary).getByText('Gravity · Ignored')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove P1' }));
    expect(screen.queryByRole('article', { name: 'Particle P1' })).toBeNull();
    expect(
      screen.getByText('No particle initial conditions yet.'),
    ).toBeTruthy();
  });
  it('changes geometry with a real choice control while keeping the dynamics label', async () => {
    builder();
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Preset' }));
    await user.click(await screen.findByRole('option', { name: 'Minkowski' }));
    expect(
      screen.getByRole('heading', { name: 'Minkowski · 3+1D' }),
    ).toBeTruthy();
    expect(screen.getByText('diag(-1, 1, 1, 1)')).toBeTruthy();
    expect(screen.getAllByText('N-body · Newton / Coulomb')).toHaveLength(3);
    expect(
      (screen.getByRole('combobox', { name: 'Time' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it('keeps invalid drafts out of the world, and fields explicitly undefined', async () => {
    builder();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Particle' }));
    change('P1 Mass · kg', '-1');
    expect(
      screen.getByLabelText('P1 Mass · kg').getAttribute('aria-invalid'),
    ).toBe('true');
    expect(
      screen.getByText('Applicable · 1 positive-mass source(s)'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Field' }));
    const field = screen.getByRole('article', { name: 'Field F2' });
    expect(within(field).getByText('Scalar field entry')).toBeTruthy();
    expect(
      within(field).getByText(/configure the field equation/),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it('provides Chinese world-building labels without translating the project identity', () => {
    render(<WorldBuilder locale="zh" setLocale={() => {}} />);
    expect(screen.getByRole('heading', { name: '世界定义' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Theatrum Physicum' }),
    ).toBeTruthy();
    expect(screen.getByText('世界尚未开始演化。')).toBeTruthy();
  });
  it('describes fields-only worlds without calling their contents empty', async () => {
    builder();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Field' }));
    expect(screen.getByText('No particle positions to preview')).toBeTruthy();
    expect(screen.queryByText('No physical contents')).toBeNull();
  });
  it('uses the adapted Chinese line for a Chinese browser language', () => {
    const language = vi
      .spyOn(window.navigator, 'language', 'get')
      .mockReturnValue('zh-CN');
    try {
      render(<GenesisApp />);
      expect(screen.getByText('起初，你创造天地。')).toBeTruthy();
      expect(screen.getByRole('main').getAttribute('lang')).toBe('zh');
      expect(screen.getAllByRole('button')).toHaveLength(1);
    } finally {
      language.mockRestore();
    }
  });
});
