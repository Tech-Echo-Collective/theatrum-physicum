'use client';
import { useEffect, useId, useState } from 'react';
import { Play, Pause, RotateCcw, StepForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  advance,
  compileWorld,
  defaultSettings,
  formatNumber,
  type Observation,
  type Plan,
  type SolverKind,
  type SolverSettings,
  type State,
} from '@/lib/physics/compiler';
import type { WorldDefinition } from '@/lib/world';
type Translate = (en: string, zh: string) => string;
type Sample = Observation['points'];
type Session = {
  world: WorldDefinition;
  settings: SolverSettings;
  plan: Plan;
  state: State;
  running: boolean;
  error: string | null;
  history: Sample[];
  rate: number;
};
export const solverNames: Record<SolverKind, string> = {
  nbody: 'N-body · Newton / Coulomb',
  ode: 'ODE · RK4',
  field: 'Scalar PDE · 1D',
  geodesic: 'GR · Prescribed metric',
};
export function usePhysics(world: WorldDefinition) {
  const [settings, setSettings] = useState(defaultSettings);
  const [session, setSession] = useState<Session | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const active =
    session?.world === world && session.settings === settings ? session : null;
  const plan = active?.plan;
  const running = active?.running ?? false;
  useEffect(() => {
    if (!running || !plan) return;
    let handle = 0,
      lastFrame = performance.now();
    const tick = () => {
      const now = performance.now(),
        wallSeconds = Math.max((now - lastFrame) / 1000, 0.001);
      lastFrame = now;
      setSession((current) => {
        if (!current || !current.running || current.plan !== plan)
          return current;
        const started = performance.now();
        let nextState = current.state,
          error: string | null = null,
          steps = 0;
        // Fixed numerical Δt; 16-step cap and an 8 ms cooperative budget per frame. A single step may exceed the budget; simulated time is never skipped.
        do {
          const result = advance(plan, nextState);
          nextState = result.state;
          error = result.error;
          steps++;
        } while (!error && steps < 16 && performance.now() - started < 8);
        return {
          ...current,
          state: nextState,
          error,
          running: !error,
          rate: (nextState.time - current.state.time) / wallSeconds,
          history: [...current.history, plan.observe(nextState).points].slice(
            -300,
          ),
        };
      });
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [plan, running]);
  function compile(invalidDraft = false) {
    if (invalidDraft) {
      setCompileError(
        'Correct the invalid definition inputs before compiling.',
      );
      setSession(null);
      return;
    }
    const result = compileWorld(world, settings);
    setCompileError(result.error);
    setSession(
      result.plan
        ? {
            world,
            settings,
            plan: result.plan,
            state: result.plan.initial,
            running: false,
            error: null,
            history: [result.plan.observe(result.plan.initial).points],
            rate: 0,
          }
        : null,
    );
  }
  function invalidate() {
    setSession(null);
    setCompileError(null);
  }
  function step() {
    if (!active) return;
    const result = advance(active.plan, active.state);
    setSession({
      ...active,
      state: result.state,
      running: false,
      error: result.error,
      history: [
        ...active.history,
        active.plan.observe(result.state).points,
      ].slice(-300),
      rate: 0,
    });
  }
  function reset() {
    if (!active) return;
    setSession({
      ...active,
      state: active.plan.initial,
      running: false,
      error: null,
      history: [active.plan.observe(active.plan.initial).points],
      rate: 0,
    });
  }
  return {
    settings,
    setSettings,
    active,
    compile,
    invalidate,
    step,
    reset,
    error: active?.error ?? compileError,
    run: () => {
      if (active && !active.error) setSession({ ...active, running: true });
    },
    pause: () => {
      if (active) setSession({ ...active, running: false, rate: 0 });
    },
  };
}
export type PhysicsController = ReturnType<typeof usePhysics>;
function TextControl({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <div className="physics-input">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          spellCheck={false}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      )}
    </div>
  );
}
function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="physics-input">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="physics-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
export function PhysicsControls({
  physics,
  t,
  hasInvalidDraft,
}: {
  physics: PhysicsController;
  t: Translate;
  hasInvalidDraft: () => boolean;
}) {
  const { settings: s, setSettings, active } = physics;
  const patch = (key: 'dt' | 'softening', value: string) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const field = <K extends keyof SolverSettings['field']>(
    key: K,
    value: SolverSettings['field'][K],
  ) =>
    setSettings((current) => ({
      ...current,
      field: { ...current.field, [key]: value },
    }));
  return (
    <>
      <TextControl
        label={s.kind === 'geodesic' ? 'Δλ' : 'Δt'}
        value={s.dt}
        onChange={(value) => patch('dt', value)}
      />
      {s.kind === 'nbody' && (
        <>
          <TextControl
            label={t('Softening ε · m', '软化长度 ε · m')}
            value={s.softening}
            onChange={(value) => patch('softening', value)}
          />
          <p className="hint">
            {t(
              'Positive masses; SI units. Set distinct initial positions for interacting particles. Δt controls numerical resolution.',
              '使用正质量与 SI 单位。相互作用粒子需要不同初始位置。Δt 决定数值分辨率。',
            )}
          </p>
        </>
      )}
      {s.kind === 'ode' && (
        <>
          <p className="hint">
            {t(
              'Use an empty Euclidean world. These explicit state variables define the system; units must be consistent.',
              '使用空的欧氏世界。下方显式状态变量定义系统，各式单位须自洽。',
            )}
          </p>
          <TextControl
            label={t('State names · comma-separated', '状态名称 · 逗号分隔')}
            value={s.ode.names}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                ode: { ...current.ode, names: value },
              }))
            }
          />
          <TextControl
            label={t(
              'dy/dt · one right-hand side per line',
              'dy/dt · 每行一个右端表达式',
            )}
            value={s.ode.equations}
            multiline
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                ode: { ...current.ode, equations: value },
              }))
            }
          />
          <TextControl
            label={t('Initial values · same order', '初始值 · 与变量顺序一致')}
            value={s.ode.initial}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                ode: { ...current.ode, initial: value },
              }))
            }
          />
        </>
      )}
      {s.kind === 'field' && (
        <>
          <p className="hint">
            {t(
              'Set Euclidean 1+1D, add one Field, and remove particles. PDE units: x in m; t in s; u in your chosen field units.',
              '设置欧氏 1+1 维，添加一个场，移除粒子。x 使用 m，t 使用 s，u 使用自行指定的场单位。',
            )}
          </p>
          <SelectControl
            label={t('Field equation', '场方程')}
            value={s.field.equation}
            options={[
              { value: 'wave', label: '∂²u/∂t² = c² ∂²u/∂x²' },
              { value: 'heat', label: '∂u/∂t = D ∂²u/∂x²' },
            ]}
            onChange={(value) => field('equation', value as 'wave' | 'heat')}
          />
          <div className="paired-inputs">
            <TextControl
              label={t('Length L · m', '长度 L · m')}
              value={s.field.length}
              onChange={(value) => field('length', value)}
            />
            <TextControl
              label={t('Grid points', '网格点数')}
              value={s.field.points}
              onChange={(value) => field('points', value)}
            />
          </div>
          <TextControl
            label={
              s.field.equation === 'wave'
                ? t('Wave speed c · m/s', '波速 c · m/s')
                : t('Diffusivity D · m²/s', '扩散系数 D · m²/s')
            }
            value={s.field.coefficient}
            onChange={(value) => field('coefficient', value)}
          />
          <SelectControl
            label={t('Boundary condition', '边界条件')}
            value={s.field.boundary}
            options={[
              { value: 'fixed', label: t('Fixed zero', '固定为零') },
              { value: 'periodic', label: t('Periodic', '周期边界') },
            ]}
            onChange={(value) =>
              field('boundary', value as 'fixed' | 'periodic')
            }
          />
          <TextControl
            label="u(x, 0)"
            value={s.field.displacement}
            onChange={(value) => field('displacement', value)}
          />
          {s.field.equation === 'wave' && (
            <TextControl
              label="∂u/∂t(x, 0)"
              value={s.field.velocity}
              onChange={(value) => field('velocity', value)}
            />
          )}
        </>
      )}
      {s.kind === 'geodesic' && (
        <>
          <p className="hint">
            {t(
              'Use an empty Minkowski or custom-metric world. Set the metric above; provide event and tangent in time-first coordinate order. c=G=1.',
              '使用空的闵可夫斯基或自定义度规世界。在上方填写度规，按时间优先的坐标顺序输入事件与切向量。c=G=1。',
            )}
          </p>
          <TextControl
            label={t('Initial event · all coordinates', '初始事件 · 全部坐标')}
            value={s.geodesic.position}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                geodesic: { ...current.geodesic, position: value },
              }))
            }
          />
          <TextControl
            label={t('Affine tangent dx/dλ', '仿射切向量 dx/dλ')}
            value={s.geodesic.tangent}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                geodesic: { ...current.geodesic, tangent: value },
              }))
            }
          />
          <SelectControl
            label={t('Trajectory type', '轨迹类型')}
            value={s.geodesic.causal}
            options={[
              {
                value: 'timelike',
                label: t('Timelike · g(u,u) = −1', '类时 · g(u,u) = −1'),
              },
              {
                value: 'null',
                label: t('Null · g(u,u) = 0', '类光 · g(u,u) = 0'),
              },
            ]}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                geodesic: {
                  ...current.geodesic,
                  causal: value as 'timelike' | 'null',
                },
              }))
            }
          />
        </>
      )}
      {s.kind !== 'nbody' && (
        <p className="hint physics-syntax">
          {t(
            'Expressions: + − * / ^, sin, cos, exp, log, sqrt; constants pi, e. Use explicit multiplication. No assignments or JavaScript.',
            '表达式支持 + − * / ^、sin、cos、exp、log、sqrt，常数 pi、e。必须显式写乘号，不支持赋值或 JavaScript。',
          )}
        </p>
      )}
      <Button
        className="compile-button"
        variant="outline"
        onClick={() => physics.compile(hasInvalidDraft())}
      >
        {t('Compile world', '编译世界')}
      </Button>
      <div className="operation-actions">
        <Button
          disabled={!active || active.running || !!active.error}
          onClick={physics.run}
        >
          <Play aria-hidden="true" />
          {t('Run', '运行')}
        </Button>
        <Button
          variant="outline"
          disabled={!active?.running}
          onClick={physics.pause}
        >
          <Pause aria-hidden="true" />
          {t('Pause', '暂停')}
        </Button>
        <Button
          variant="outline"
          disabled={!active || active.running || !!active.error}
          onClick={physics.step}
        >
          <StepForward aria-hidden="true" />
          {t('Step', '单步')}
        </Button>
        <Button variant="outline" disabled={!active} onClick={physics.reset}>
          <RotateCcw aria-hidden="true" />
          {t('Reset', '重置')}
        </Button>
      </div>
      <p className="hint">
        {t(
          'Editing any definition stops evolution and requires recompilation. Reset restores the compiled initial state. Numerical time advances only through completed solver steps.',
          '修改定义会停止演化并要求重新编译。重置恢复编译时的初始状态，数值时间只随已完成的求解步推进。',
        )}
      </p>
      {physics.error && (
        <p className="physics-error" role="alert">
          {physics.error}
        </p>
      )}
    </>
  );
}
export function SolverChoice({
  physics,
  t,
}: {
  physics: PhysicsController;
  t: Translate;
}) {
  return (
    <SelectControl
      label={t('Dynamical model', '动力学模型')}
      value={physics.settings.kind}
      options={Object.entries(solverNames).map(([value, label]) => ({
        value,
        label,
      }))}
      onChange={(value) =>
        physics.setSettings((current) => ({
          ...current,
          kind: value as SolverKind,
        }))
      }
    />
  );
}
export function PhysicsResults({
  physics,
  t,
}: {
  physics: PhysicsController;
  t: Translate;
}) {
  const session = physics.active;
  if (!session)
    return (
      <section className="physics-results physics-awaiting">
        <span className="eyebrow">{t('EVOLUTION', '演化')}</span>
        <h3>{t('Define → Compile → Run', '定义 → 编译 → 运行')}</h3>
        <p className="hint">
          {t(
            'Choose the dynamical model, specify its initial state, then compile the world. Incompatible definitions produce an explicit error.',
            '选择动力学模型并填写初始状态，然后编译世界。不兼容的定义会返回明确错误。',
          )}
        </p>
      </section>
    );
  const { plan, state, history } = session;
  const observation = plan.observe(state);
  const isField = plan.kind === 'field';
  const samples = isField ? [observation.points] : history;
  const all = samples.flat();
  const xs = all.map((p) => p.x),
    ys = all.map((p) => p.y);
  // Normalize coordinates before subtracting: finite extreme inputs must not overflow SVG coordinates.
  const scaleX = Math.max(...xs.map(Math.abs)) || 1;
  const scaleY = Math.max(...ys.map(Math.abs)) || 1;
  const minX = Math.min(...xs.map((x) => x / scaleX)),
    maxX = Math.max(...xs.map((x) => x / scaleX));
  const minY = Math.min(...ys.map((y) => y / scaleY)),
    maxY = Math.max(...ys.map((y) => y / scaleY));
  const padX = maxX === minX ? 1 : Math.max(maxX - minX, 1e-12) * 0.1;
  const padY = maxY === minY ? 1 : Math.max(maxY - minY, 1e-12) * 0.1;
  const x0 = minX - padX,
    x1 = maxX + padX,
    y0 = minY - padY,
    y1 = maxY + padY;
  const px = (x: number) => 60 + ((x / scaleX - x0) / (x1 - x0)) * 590;
  const py = (y: number) => 345 - ((y / scaleY - y0) / (y1 - y0)) * 295;
  const paths = isField
    ? [observation.points]
    : observation.points.map((point) =>
        samples.flatMap((sample) => sample.filter((p) => p.id === point.id)),
      );
  return (
    <section className="physics-results" aria-labelledby="evolution-title">
      <div className="summary-topline">
        <span className="eyebrow">
          {t('EVOLUTION / OBSERVATION', '演化 / 观测')}
        </span>
        <span className="status-pill">
          {session.running
            ? t('Running', '运行中')
            : session.error
              ? t('Stopped', '已停止')
              : t('Ready / paused', '就绪 / 暂停')}
        </span>
      </div>
      <h3 id="evolution-title">{plan.label}</h3>
      <dl className="physics-readings">
        <div>
          <dt>{plan.timeLabel}</dt>
          <dd data-testid="runtime-time">{formatNumber(state.time)}</dd>
        </div>
        <div>
          <dt>{t('Steps', '步数')}</dt>
          <dd>{state.steps}</dd>
        </div>
        <div>
          <dt>{t('Model time / wall second', '模型时间 / 实际秒')}</dt>
          <dd>{formatNumber(session.rate)}</dd>
        </div>
        {observation.readings.map((reading) => (
          <div key={reading.label}>
            <dt>{reading.label}</dt>
            <dd>{reading.value}</dd>
          </div>
        ))}
      </dl>
      <svg
        viewBox="0 0 720 400"
        className="physics-plot"
        role="img"
        aria-label={t('Numerically evolved state', '数值演化状态')}
      >
        <title>{plan.label}</title>
        <path className="stage-axis" d="M60 50V345H650" />
        {paths.map((points, i) => (
          <polyline
            key={isField ? 'field' : (points[0]?.id ?? i)}
            points={points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
            fill="none"
            stroke={['#61d7de', '#568cff', '#d5aeff', '#70e6b1'][i % 4]}
            strokeWidth="1.5"
          />
        ))}
        {!isField &&
          observation.points.map((p, i) => (
            <g key={p.id}>
              <circle
                cx={px(p.x)}
                cy={py(p.y)}
                r="4"
                fill={['#61d7de', '#568cff', '#d5aeff', '#70e6b1'][i % 4]}
              />
              <text
                x={px(p.x) + 8}
                y={py(p.y) - 8 - i * 4}
                className="particle-label"
              >
                {p.label}
              </text>
            </g>
          ))}
        <text x="60" y="365" className="axis-label">
          {formatNumber(x0 * scaleX)}
        </text>
        <text x="650" y="365" textAnchor="end" className="axis-label">
          {formatNumber(x1 * scaleX)}
        </text>
        <text x="355" y="390" textAnchor="middle" className="axis-label">
          {plan.xLabel}
        </text>
        <text x="62" y="28" className="axis-label">
          {plan.yLabel} · [{formatNumber(y0 * scaleY)},{' '}
          {formatNumber(y1 * scaleY)}]
        </text>
      </svg>
      <p className="hint">
        {isField
          ? t(
              'Current field samples; linear interpolation is for display only.',
              '显示当前场采样点，线性连线仅用于显示。',
            )
          : t(
              'Coordinate projection with independently scaled axes; last 300 rendered samples. Labels are coordinates, not physical distances in curved spacetime.',
              '坐标投影，两轴独立缩放；保留最近 300 个显示采样。曲时空中的坐标差不等同于物理距离。',
            )}
      </p>
      <details className="physics-details">
        <summary>
          {t('State and evaluated tensors', '状态与已求值张量')}
        </summary>
        <dl>
          {observation.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.values.map(formatNumber).join(', ')}</dd>
            </div>
          ))}
        </dl>
      </details>
      {!!plan.symbolic?.length && (
        <details className="physics-details">
          <summary>{t('Symbolic metric derivatives', '度规符号导数')}</summary>
          <dl>
            {plan.symbolic.map((entry) => (
              <div key={entry.label}>
                <dt>{entry.label}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <details className="physics-details" open>
        <summary>
          {t('Model and numerical scope', '模型与数值适用范围')}
        </summary>
        <ul>
          {plan.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
