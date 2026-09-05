'use client';

import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Dispatch, ReactNode } from 'react';
import { Plus, Pause, Play, RotateCcw, X, Circle, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createWorld,
  getInteractions,
  metricDescription,
  parseFiniteNumber,
  worldReducer,
} from '@/lib/world';
import type {
  Geometry,
  Particle,
  WorldAction,
  WorldDefinition,
} from '@/lib/world';

type Locale = 'en' | 'zh';
type Translate = (en: string, zh: string) => string;
const geometryNames: Record<Geometry, string> = {
  euclidean: 'Euclidean',
  minkowski: 'Minkowski',
  custom: 'Custom',
};

function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="input-field">
      <label id={id}>{label}</label>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v !== null) onChange(v);
        }}
        items={options}
        disabled={disabled}
      >
        <SelectTrigger aria-labelledby={id} className="world-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="world-options" alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem value={option.value} key={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumericInput({
  label,
  value,
  onChange,
  min,
  t,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  t: Translate;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const displayed = draft ?? String(value);
  const valid = parseFiniteNumber(displayed, min);
  return (
    <div className="input-field">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={displayed}
        aria-invalid={valid === null}
        aria-describedby={valid === null ? `${id}-error` : undefined}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const number = parseFiniteNumber(text, min);
          if (number !== null) onChange(number);
        }}
        onBlur={() => {
          if (valid !== null) setDraft(null);
        }}
      />
      {valid === null && (
        <span id={`${id}-error`} className="input-error">
          {min === 0
            ? t('Enter a finite number ≥ 0.', '请输入大于或等于 0 的有限数值。')
            : t('Enter a finite number.', '请输入有限数值。')}
        </span>
      )}
    </div>
  );
}

function CoordinateInput({
  label,
  value,
  coordinates,
  onChange,
  t,
}: {
  label: string;
  value: string;
  coordinates: string[];
  onChange: (value: string) => void;
  t: Translate;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const current = draft ?? value;
  const valid =
    current.trim().length > 0 &&
    (!coordinates.includes(current.trim()) || current.trim() === value);
  return (
    <div className="input-field">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        value={current}
        maxLength={12}
        aria-invalid={!valid}
        aria-describedby={!valid ? `${id}-error` : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = e.target.value.trim();
          if (next && (!coordinates.includes(next) || next === value))
            onChange(next);
        }}
        onBlur={() => {
          if (valid) setDraft(null);
        }}
      />
      {!valid && (
        <span className="input-error" id={`${id}-error`}>
          {t('Use a unique coordinate name.', '请使用不重复的坐标名称。')}
        </span>
      )}
    </div>
  );
}

function Section({
  number,
  title,
  children,
  id,
}: {
  number: string;
  title: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <section className="control-section" aria-labelledby={id}>
      <div className="section-title">
        <span>{number}</span>
        <h3 id={id}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function VectorEditor({
  particle,
  world,
  dispatch,
  property,
  t,
}: {
  particle: Particle;
  world: WorldDefinition;
  dispatch: Dispatch<WorldAction>;
  property: 'position' | 'velocity';
  t: Translate;
}) {
  const label =
    property === 'position' ? t('Position', '位置') : t('Velocity', '速度');
  const unit = property === 'position' ? 'm' : 'm/s';
  return (
    <fieldset className="vector-editor">
      <legend>
        {label} <span>{unit}</span>
      </legend>
      <div className="vector-inputs">
        {world.initialConditions.particles[particle.id][property].map(
          (value, index) => (
            <NumericInput
              key={`${particle.id}-${property}-${index}`}
              t={t}
              label={`${particle.name} ${label} ${world.spacetime.coordinates.space[index]}`}
              value={value}
              onChange={(number) =>
                dispatch({
                  type: 'initial',
                  id: particle.id,
                  property,
                  index,
                  value: number,
                })
              }
            />
          ),
        )}
      </div>
    </fieldset>
  );
}

function WorldStage({
  world,
  particles,
  t,
}: {
  world: WorldDefinition;
  particles: Particle[];
  t: Translate;
}) {
  const { spatialDimensions, geometry, coordinates } = world.spacetime;
  const states = world.initialConditions.particles;
  const extent = Math.max(
    5,
    ...particles.flatMap((particle) =>
      states[particle.id].position.slice(0, 2).map(Math.abs),
    ),
  );
  // A coordinate projection only. It never advances time, interpolates motion or evaluates a metric.
  const point = (particle: Particle) => {
    const position = states[particle.id].position;
    return {
      x: 360 + (position[0] / extent) * 270,
      y: 240 - ((position[1] ?? 0) / extent) * 170,
    };
  };
  return (
    <section className="stage" aria-labelledby="stage-title">
      <div className="stage-header">
        <h2 className="eyebrow" id="stage-title">
          THEATRUM / {t('STAGE', '舞台')}
        </h2>
        <span className="stage-mode">{t('Initial state', '初始状态')}</span>
      </div>
      <div className="stage-canvas">
        <svg
          viewBox="0 0 720 480"
          role="img"
          aria-label={t(
            'Static coordinate preview of particle positions',
            '粒子位置的静态坐标预览',
          )}
        >
          <defs>
            <pattern
              id="coordinate-grid"
              width="45"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M45 0H0V40"
                fill="none"
                stroke="var(--border)"
                strokeWidth=".55"
              />
            </pattern>
          </defs>
          <rect
            x="45"
            y="40"
            width="630"
            height="400"
            fill="url(#coordinate-grid)"
            opacity=".55"
          />
          <path className="stage-axis" d="M65 240H655" />
          {spatialDimensions > 1 && (
            <path className="stage-axis" d="M360 55V425" />
          )}
          <text x="655" y="228" textAnchor="end" className="axis-label">
            {coordinates.space[0]}
          </text>
          {spatialDimensions > 1 && (
            <text x="373" y="62" className="axis-label">
              {coordinates.space[1]}
            </text>
          )}
          <text x="370" y="258" className="axis-origin">
            0
          </text>
          {particles.map((particle, index) => {
            const { x, y } = point(particle);
            const overlap = particles.slice(0, index).filter((other) => {
              const previous = point(other);
              return previous.x === x && previous.y === y;
            }).length;
            return (
              <g key={particle.id}>
                <title>
                  {particle.name}: ({states[particle.id].position.join(', ')}) m
                </title>
                <circle cx={x} cy={y} r="5" className="stage-particle" />
                <text
                  x={x + 12}
                  y={y - 12 - overlap * 18}
                  className="particle-label"
                >
                  {particle.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="stage-caption">
        <p>{t('The world is without motion.', '世界尚未开始演化。')}</p>
        <span>
          {particles.length
            ? t('Positions only · no evolution', '仅显示位置 · 尚未演化')
            : world.contents.length
              ? t('No particle positions to preview', '暂无可预览的粒子位置')
              : t('No physical contents', '尚无物理内容')}
        </span>
      </div>
      <div className="stage-footer">
        <span>
          {spatialDimensions > 2
            ? t(
                '2D projection · the third coordinate remains in the definition',
                '二维投影 · 第三个空间坐标保留在世界定义中',
              )
            : t('Coordinate preview', '坐标预览')}
          {geometry === 'custom'
            ? t(' · metric not evaluated', ' · 度规未求值')
            : ''}
        </span>
        <span>±{extent.toPrecision(3)} m</span>
      </div>
    </section>
  );
}

export function WorldBuilder({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}) {
  const [world, dispatch] = useReducer(worldReducer, undefined, createWorld);
  const sequence = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const t: Translate = (en, zh) => (locale === 'zh' ? zh : en);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const particles = world.contents.filter(
    (entity): entity is Particle => entity.kind === 'particle',
  );
  const fieldCount = world.contents.length - particles.length;
  const interactions = getInteractions(world);
  const activeCount = interactions.filter(
    (interaction) => interaction.status === 'enabled',
  ).length;
  const names = {
    electromagnetism: t('Electromagnetism', '电磁相互作用'),
    gravity: t('Gravity', '引力'),
  };
  const { spacetime } = world;
  function add(kind: 'particle' | 'field') {
    sequence.current += 1;
    const name = `${kind === 'particle' ? 'P' : 'F'}${sequence.current}`;
    dispatch({ type: 'add', kind, id: name, name });
  }
  return (
    <main className="builder" lang={locale}>
      <header className="builder-header">
        <img
          src="/assets/theatrum-physicum.svg"
          alt=""
          width={76}
          height={76}
        />
        <div>
          <span className="eyebrow">TECH ECHO PHYSICA</span>
          <h1 ref={headingRef} tabIndex={-1}>
            Theatrum Physicum
          </h1>
        </div>
        <div className="builder-language">
          <Choice
            label={t('Language', '语言')}
            value={locale}
            options={[
              { value: 'en', label: 'English' },
              { value: 'zh', label: '中文' },
            ]}
            onChange={(value) => setLocale(value as Locale)}
          />
        </div>
      </header>
      <div className="workspace">
        <aside className="controls" aria-labelledby="definition-title">
          <div className="controls-heading">
            <h2 id="definition-title">{t('World definition', '世界定义')}</h2>
            <p>
              {t('What exists. What laws apply.', '定义存在之物与适用定律。')}
            </p>
          </div>
          <Section
            id="spacetime-title"
            number="01"
            title={t('Spacetime', '时空')}
          >
            <fieldset className="control-group">
              <legend>{t('Dimensions', '维度')}</legend>
              <div className="paired-inputs">
                <Choice
                  label={t('Space', '空间')}
                  value={String(spacetime.spatialDimensions)}
                  options={[1, 2, 3].map((n) => ({
                    value: String(n),
                    label: `${n}D`,
                  }))}
                  onChange={(value) =>
                    dispatch({
                      type: 'dimensions',
                      space: Number(value),
                      time: spacetime.timeDimensions,
                    })
                  }
                />
                <Choice
                  label={t('Time', '时间')}
                  value={String(spacetime.timeDimensions)}
                  options={[0, 1].map((n) => ({
                    value: String(n),
                    label: `${n}D`,
                  }))}
                  disabled={spacetime.geometry === 'minkowski'}
                  onChange={(value) =>
                    dispatch({
                      type: 'dimensions',
                      space: spacetime.spatialDimensions,
                      time: Number(value),
                    })
                  }
                />
              </div>
              <p className="hint">
                {t(
                  'Reducing space dimensions removes the unused position and velocity components.',
                  '减少空间维度会移除多余的位置与速度分量。',
                )}
              </p>
            </fieldset>
            <fieldset className="control-group">
              <legend>{t('Geometry', '几何')}</legend>
              <Choice
                label={t('Preset', '预设')}
                value={spacetime.geometry}
                options={(Object.keys(geometryNames) as Geometry[]).map(
                  (value) => ({
                    value,
                    label:
                      value === 'custom'
                        ? t('Custom', '自定义')
                        : geometryNames[value],
                  }),
                )}
                onChange={(value) =>
                  dispatch({ type: 'geometry', geometry: value as Geometry })
                }
              />
            </fieldset>
            <fieldset className="control-group">
              <legend>{t('Metric', '度规')}</legend>
              {spacetime.geometry === 'custom' ? (
                <div className="input-field">
                  <label htmlFor="custom-metric">
                    {t('Metric definition', '度规定义')}
                  </label>
                  <Textarea
                    id="custom-metric"
                    rows={4}
                    value={spacetime.metric.customDraft}
                    placeholder="g_ab = …"
                    maxLength={4000}
                    onChange={(e) =>
                      dispatch({ type: 'metric', value: e.target.value })
                    }
                  />
                  <p className="hint">
                    {t(
                      'Unevaluated draft. No parsing or physical validation.',
                      '未求值的草稿，不进行解析或物理验证。',
                    )}
                  </p>
                </div>
              ) : (
                <>
                  <output className="metric-value">
                    {metricDescription(world)}
                  </output>
                  <p className="hint">
                    {spacetime.geometry === 'euclidean'
                      ? t(
                          'Spatial metric. Time, when present, is an independent parameter.',
                          '空间度规。时间存在时，作为独立参数。',
                        )
                      : t(
                          'Spacetime metric, time first. One time dimension; dynamics remain a classical approximation.',
                          '时空度规，时间在前。含一个时间维度；动力学仍采用经典近似。',
                        )}
                  </p>
                </>
              )}
            </fieldset>
            <fieldset className="control-group">
              <legend>{t('Coordinates', '坐标')}</legend>
              <div className="coordinate-inputs">
                {(['time', 'space'] as const).flatMap((axis) =>
                  spacetime.coordinates[axis].map((value, index) => (
                    <CoordinateInput
                      key={`${axis}-${index}`}
                      t={t}
                      label={
                        axis === 'time'
                          ? t('Time coordinate', '时间坐标')
                          : `${t('Space', '空间')} ${index + 1}`
                      }
                      value={value}
                      coordinates={[
                        ...spacetime.coordinates.time,
                        ...spacetime.coordinates.space,
                      ]}
                      onChange={(text) =>
                        dispatch({
                          type: 'coordinate',
                          axis,
                          index,
                          value: text,
                        })
                      }
                    />
                  )),
                )}
              </div>
            </fieldset>
          </Section>
          <Section
            id="contents-title"
            number="02"
            title={t('Matter & Fields', '物质与场')}
          >
            <div className="add-actions">
              <Button variant="outline" onClick={() => add('particle')}>
                <Plus aria-hidden="true" />
                {t('Particle', '粒子')}
              </Button>
              <Button variant="outline" onClick={() => add('field')}>
                <Plus aria-hidden="true" />
                {t('Field', '场')}
              </Button>
            </div>
            {!world.contents.length && (
              <p className="empty-note">
                {t(
                  'This world is empty. Add its first physical content.',
                  '这个世界还是空的。添加第一个物理对象。',
                )}
              </p>
            )}
            <div className="entity-list">
              {world.contents.map((entity) => (
                <article
                  className="entity-card"
                  key={entity.id}
                  aria-label={`${entity.kind === 'particle' ? t('Particle', '粒子') : t('Field', '场')} ${entity.name}`}
                >
                  <header>
                    <div>
                      {entity.kind === 'particle' ? (
                        <Circle aria-hidden="true" />
                      ) : (
                        <Waves aria-hidden="true" />
                      )}
                      <h4>{entity.name}</h4>
                      <span>
                        {entity.kind === 'particle'
                          ? t('Particle', '粒子')
                          : t('Field', '场')}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${t('Remove', '移除')} ${entity.name}`}
                      onClick={() =>
                        dispatch({ type: 'remove', id: entity.id })
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </header>
                  {entity.kind === 'particle' ? (
                    <>
                      <div className="paired-inputs">
                        <NumericInput
                          label={`${entity.name} ${t('Mass', '质量')} · kg`}
                          value={entity.mass}
                          min={0}
                          t={t}
                          onChange={(value) =>
                            dispatch({
                              type: 'particle',
                              id: entity.id,
                              property: 'mass',
                              value,
                            })
                          }
                        />
                        <NumericInput
                          label={`${entity.name} ${t('Charge', '电荷')} · C`}
                          value={entity.charge}
                          t={t}
                          onChange={(value) =>
                            dispatch({
                              type: 'particle',
                              id: entity.id,
                              property: 'charge',
                              value,
                            })
                          }
                        />
                      </div>
                      <VectorEditor
                        t={t}
                        particle={entity}
                        world={world}
                        dispatch={dispatch}
                        property="position"
                      />
                      <VectorEditor
                        t={t}
                        particle={entity}
                        world={world}
                        dispatch={dispatch}
                        property="velocity"
                      />
                      {entity.mass === 0 && (
                        <p className="hint">
                          {t(
                            'Zero mass is recorded only; massless dynamics are not implemented.',
                            '仅记录零质量定义，尚未实现无质量动力学。',
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="status-pill neutral">
                        {t('Undefined', '未定义')}
                      </span>
                      <p className="hint">
                        {t(
                          'Field configuration and interaction applicability are not assessed yet. This entry does not create an active field.',
                          '场配置与相互作用适用性尚未评估。此条目不会创建正在作用的场。',
                        )}
                      </p>
                    </>
                  )}
                </article>
              ))}
            </div>
          </Section>
          <Section
            id="interactions-title"
            number="03"
            title={t('Interactions', '相互作用')}
          >
            <div className="dynamics-row">
              <span>{t('Dynamics', '动力学')}</span>
              <strong>{t('Classical approximation', '经典近似')}</strong>
            </div>
            <p className="hint interaction-intro">
              {t(
                'Mass and charge make interactions applicable. Eligibility does not imply a computed force or a self-force.',
                '质量与电荷决定相互作用的适用性。适用不代表已计算作用力或存在自作用力。',
              )}
            </p>
            {interactions.map((interaction) => (
              <div className="interaction-card" key={interaction.kind}>
                <div className="interaction-heading">
                  <h4 id={`${interaction.kind}-name`}>
                    {names[interaction.kind]}
                  </h4>
                  <span className={`status-pill ${interaction.status}`}>
                    {interaction.status === 'enabled'
                      ? t('Enabled', '已启用')
                      : interaction.status === 'ignored'
                        ? t('Ignored', '已忽略')
                        : t('Not applicable', '不适用')}
                  </span>
                </div>
                <p className="hint">
                  {interaction.applicable
                    ? `${t('Applicable', '适用')} · ${interaction.sourceCount} ${interaction.kind === 'gravity' ? t('positive-mass source(s)', '个正质量源') : t('charged source(s)', '个带电源')}`
                    : interaction.kind === 'gravity'
                      ? t(
                          'Requires a particle with positive mass.',
                          '需要具有正质量的粒子。',
                        )
                      : t(
                          'Requires a particle with nonzero charge.',
                          '需要具有非零电荷的粒子。',
                        )}
                </p>
                <label className="approximation-choice">
                  <Checkbox
                    aria-labelledby={`${interaction.kind}-name ${interaction.kind}-ignore-label`}
                    disabled={!interaction.applicable}
                    checked={world.approximations.ignoredInteractions.includes(
                      interaction.kind,
                    )}
                    onCheckedChange={(checked) =>
                      dispatch({
                        type: 'ignore',
                        kind: interaction.kind,
                        ignored: checked === true,
                      })
                    }
                  />
                  <span id={`${interaction.kind}-ignore-label`}>
                    {t('Ignore as an approximation', '作为近似而忽略')}
                  </span>
                </label>
              </div>
            ))}
          </Section>
          <Section
            id="initial-title"
            number="04"
            title={t('Initial Conditions', '初始条件')}
          >
            <p className="hint">
              {t(
                'Positions and velocities above define the initial state. No momentum is derived.',
                '上方的位置与速度定义初始状态，不推导动量。',
              )}
            </p>
            {particles.length ? (
              <div className="initial-ledger">
                {particles.map((particle) => (
                  <div key={particle.id}>
                    <strong>{particle.name}</strong>
                    <span>
                      r₀ = (
                      {world.initialConditions.particles[
                        particle.id
                      ].position.join(', ')}
                      ) m<br />
                      v₀ = (
                      {world.initialConditions.particles[
                        particle.id
                      ].velocity.join(', ')}
                      ) m/s
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-note">
                {t('No particle initial conditions yet.', '尚无粒子初始条件。')}
              </p>
            )}
            <dl className="reserved-conditions">
              <div>
                <dt>{t('Field configurations', '场配置')}</dt>
                <dd>{t('Not defined', '未定义')}</dd>
              </div>
              <div>
                <dt>{t('Boundary conditions', '边界条件')}</dt>
                <dd>{t('Not defined', '未定义')}</dd>
              </div>
            </dl>
          </Section>
          <Section
            id="operations-title"
            number="05"
            title={t('Operations', '操作')}
          >
            <div className="operation-actions" aria-describedby="runtime-note">
              <Button disabled>
                <Play aria-hidden="true" />
                {t('Run', '运行')}
              </Button>
              <Button variant="outline" disabled>
                <Pause aria-hidden="true" />
                {t('Pause', '暂停')}
              </Button>
              <Button variant="outline" disabled>
                <RotateCcw aria-hidden="true" />
                {t('Reset', '重置')}
              </Button>
            </div>
            <p id="runtime-note" className="hint">
              {t(
                'Evolution is not available yet. These controls become operational with a real runtime.',
                '演化功能尚未开放。这些控件将在接入真实运行系统后启用。',
              )}
            </p>
          </Section>
        </aside>
        <div className="world-area">
          <section
            className="world-summary"
            aria-labelledby="current-world-title"
          >
            <div className="summary-topline">
              <span className="eyebrow">{t('CURRENT WORLD', '当前世界')}</span>
              <span className="world-state">
                {t('Defined · not evolving', '已定义 · 未演化')}
              </span>
            </div>
            <h2 id="current-world-title">
              {spacetime.geometry === 'custom'
                ? t('Custom geometry', '自定义几何')
                : geometryNames[spacetime.geometry]}{' '}
              <span>
                · {spacetime.spatialDimensions}+{spacetime.timeDimensions}D
              </span>
            </h2>
            <div className="world-tags" aria-live="polite">
              <span className="status-pill theory">
                {t('Classical approximation', '经典近似')}
              </span>
              {interactions
                .filter((interaction) => interaction.applicable)
                .map((interaction) => (
                  <span
                    key={interaction.kind}
                    className={`status-pill ${interaction.status}`}
                  >
                    {names[interaction.kind]}
                    {interaction.status === 'ignored'
                      ? t(' · Ignored', ' · 已忽略')
                      : ''}
                  </span>
                ))}
              {spacetime.geometry === 'custom' && (
                <span className="status-pill neutral">
                  {t('Metric unevaluated', '度规未求值')}
                </span>
              )}
            </div>
            <dl className="world-stats">
              <div>
                <dt>{t('Time', '时间')}</dt>
                <dd>
                  —<span>{t('not started', '尚未开始')}</span>
                </dd>
              </div>
              <div>
                <dt>{t('Particles', '粒子')}</dt>
                <dd>{particles.length.toString().padStart(2, '0')}</dd>
              </div>
              <div>
                <dt>{t('Fields', '场')}</dt>
                <dd>
                  {fieldCount.toString().padStart(2, '0')}
                  {fieldCount > 0 && <span>{t('undefined', '未定义')}</span>}
                </dd>
              </div>
              <div>
                <dt>{t('Enabled interactions', '启用的相互作用')}</dt>
                <dd>{activeCount.toString().padStart(2, '0')}</dd>
              </div>
            </dl>
          </section>
          <WorldStage world={world} particles={particles} t={t} />
        </div>
      </div>
    </main>
  );
}

function subscribeLanguage(onChange: () => void) {
  window.addEventListener('languagechange', onChange);
  return () => window.removeEventListener('languagechange', onChange);
}
function browserLocale(): Locale {
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
const serverLocale = (): Locale => 'en';

export function GenesisApp() {
  const [created, setCreated] = useState(false);
  const detectedLocale = useSyncExternalStore(
    subscribeLanguage,
    browserLocale,
    serverLocale,
  );
  const [chosenLocale, setLocale] = useState<Locale | null>(null);
  const locale = chosenLocale ?? detectedLocale;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return created ? (
    <WorldBuilder locale={locale} setLocale={setLocale} />
  ) : (
    <main className="genesis-landing" lang={locale}>
      <div className="genesis-identity">
        <img
          src="/assets/theatrum-physicum.svg"
          alt=""
          width={76}
          height={76}
        />
        <span className="eyebrow">TECH ECHO PHYSICA</span>
        <h1>Theatrum Physicum</h1>
      </div>
      <Button className="genesis-button" onClick={() => setCreated(true)}>
        Genesis
      </Button>
      <p className="genesis-line">
        {locale === 'zh'
          ? '起初，你创造天地。'
          : 'In the beginning, you created the heavens and the earth.'}
      </p>
    </main>
  );
}
