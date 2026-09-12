import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorldBuilder } from '@/components/genesis-app';
function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}
function change(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}
const disabled = (name: string) =>
  (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
describe('Actual runtime controls', () => {
  it('compiles, single-steps, resets and invalidates on definition edits', async () => {
    render(<WorldBuilder locale="en" setLocale={() => {}} />);
    click('Particle');
    change('P1 Velocity x', '2');
    click('Compile world');
    expect(disabled('Run')).toBe(false);
    expect(screen.getByTestId('runtime-time').textContent).toBe('0');
    click('Step');
    expect(screen.getByTestId('runtime-time').textContent).toBe('0.01');
    expect(
      screen.getByRole('img', { name: 'Numerically evolved state' }),
    ).toBeTruthy();
    click('Reset');
    expect(screen.getByTestId('runtime-time').textContent).toBe('0');
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('P1 Mass · kg'));
    expect(disabled('Run')).toBe(true);
    click('Compile world');
    expect(screen.getByRole('alert').textContent).toMatch(/invalid definition/);
    expect(screen.queryByTestId('runtime-time')).toBeNull();
  });
  it('runs numerical frames, pauses and cancels the scheduled frame', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        sequence++;
        callbacks.set(sequence, callback);
        return sequence;
      });
    const cancel = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id) => {
        callbacks.delete(id);
      });
    try {
      render(<WorldBuilder locale="en" setLocale={() => {}} />);
      click('Particle');
      change('P1 Velocity x', '1');
      click('Compile world');
      click('Run');
      expect(disabled('Pause')).toBe(false);
      act(() => {
        const first = [...callbacks.entries()][0];
        callbacks.delete(first[0]);
        first[1](16);
      });
      const time = Number(screen.getByTestId('runtime-time').textContent);
      expect(time).toBeGreaterThan(0);
      expect(time).toBeLessThanOrEqual(0.16);
      click('Pause');
      expect(disabled('Pause')).toBe(true);
      expect(callbacks.size).toBe(0);
      expect(Number(screen.getByTestId('runtime-time').textContent)).toBe(time);
    } finally {
      raf.mockRestore();
      cancel.mockRestore();
    }
  });
  it('lets the user enter and evolve a real ODE', () => {
    render(<WorldBuilder locale="en" setLocale={() => {}} />);
    change('Dynamical model', 'ode');
    change('State names · comma-separated', 'q');
    change('dy/dt · one right-hand side per line', 't');
    change('Initial values · same order', '0');
    change('Δt', '.1');
    click('Compile world');
    click('Step');
    expect(screen.getByTestId('runtime-time').textContent).toBe('0.1');
    expect(screen.getByText('0.005')).toBeTruthy();
    change('Δt', '0');
    expect(disabled('Run')).toBe(true);
    click('Compile world');
    expect(screen.getByRole('alert').textContent).toMatch(/positive/);
  });
  it('plots extreme finite equation states without nonfinite SVG attributes', () => {
    render(<WorldBuilder locale="en" setLocale={() => {}} />);
    change('Dynamical model', 'ode');
    change('dy/dt · one right-hand side per line', '0\n0');
    change('Initial values · same order', '1e308,-1e308');
    click('Compile world');
    const plot = screen.getByRole('img', { name: 'Numerically evolved state' });
    for (const element of plot.querySelectorAll('circle,polyline')) {
      for (const attribute of element.attributes)
        expect(attribute.value).not.toMatch(/NaN|Infinity/);
    }
  });
  it('reports incompatible geometry instead of starting a fake runtime', async () => {
    render(<WorldBuilder locale="en" setLocale={() => {}} />);
    const user = userEvent.setup();
    click('Particle');
    await user.click(screen.getByRole('combobox', { name: 'Preset' }));
    await user.click(await screen.findByRole('option', { name: 'Minkowski' }));
    click('Compile world');
    expect(screen.getByRole('alert').textContent).toMatch(/Euclidean/);
    expect(disabled('Run')).toBe(true);
  });
});
