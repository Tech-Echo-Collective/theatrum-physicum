import {
  differentiate,
  evaluate,
  expressionText,
  parseExpression,
  validName,
  type Expr,
} from './expression';
import { finite } from './numerics';
type Matrix = number[][];
const matrix = (n: number, f: (i: number, j: number) => number): Matrix =>
  Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => f(i, j)),
  );
export function inverse(a: Matrix): Matrix {
  const n = a.length;
  const scale = Math.max(...a.flat().map(Math.abs));
  if (!scale || !Number.isFinite(scale))
    throw new Error('Metric is singular or nonfinite.');
  const rows = a.map((r, i) => [
    ...r.map((v) => v / scale),
    ...Array.from({ length: n }, (_, j) => Number(i === j)),
  ]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(rows[i][k]) > Math.abs(rows[pivot][k])) pivot = i;
    if (Math.abs(rows[pivot][k]) < 1e-12)
      throw new Error(
        'Metric is singular or too ill-conditioned in these coordinates.',
      );
    [rows[k], rows[pivot]] = [rows[pivot], rows[k]];
    const divisor = rows[k][k];
    rows[k] = rows[k].map((v) => v / divisor);
    for (let i = 0; i < n; i++)
      if (i !== k) {
        const factor = rows[i][k];
        rows[i] = rows[i].map((v, j) => v - factor * rows[k][j]);
      }
  }
  return rows.map((row) =>
    finite(
      row.slice(n).map((v) => v / scale),
      'Inverse metric',
    ),
  );
}
/** Jacobi rotations give the inertia of a real symmetric matrix, including off-diagonal time coordinates. */
function signature(a: Matrix): number[] {
  const n = a.length,
    scale = Math.max(...a.flat().map(Math.abs));
  const b = a.map((row) => row.map((x) => x / scale));
  for (let iteration = 0; iteration < 100; iteration++) {
    let p = 0,
      q = 1;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(b[i][j]) > Math.abs(b[p][q])) {
          p = i;
          q = j;
        }
    if (Math.abs(b[p][q]) < 1e-13) break;
    const angle = 0.5 * Math.atan2(2 * b[p][q], b[q][q] - b[p][p]);
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const pp = b[p][p],
      qq = b[q][q],
      pq = b[p][q];
    for (let k = 0; k < n; k++)
      if (k !== p && k !== q) {
        const kp = b[k][p],
          kq = b[k][q];
        b[k][p] = b[p][k] = c * kp - s * kq;
        b[k][q] = b[q][k] = s * kp + c * kq;
      }
    b[p][p] = c * c * pp - 2 * s * c * pq + s * s * qq;
    b[q][q] = s * s * pp + 2 * s * c * pq + c * c * qq;
    b[p][q] = b[q][p] = 0;
  }
  return b.map((row, i) => row[i]);
}
export type Metric = ReturnType<typeof compileMetric>;
export function compileMetric(source: string, coordinates: string[]) {
  const n = coordinates.length;
  if (
    n < 2 ||
    n > 4 ||
    new Set(coordinates).size !== n ||
    !coordinates.every(validName)
  )
    throw new Error(
      'Metric requires 2–4 unique coordinate names (letters, digits, underscore; no reserved names).',
    );
  if (source.length > 16000)
    throw new Error('Metric exceeds 16000 characters.');
  const diag = /^\s*diag\(([\s\S]*)\)\s*$/.exec(source);
  let entries: string[][];
  if (diag) {
    const parts = diag[1].split(',');
    if (parts.length !== n)
      throw new Error(`Metric needs ${n} diagonal entries.`);
    entries = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? parts[i] : '0')),
    );
  } else entries = source.split(';').map((row) => row.split(','));
  if (entries.length !== n || entries.some((row) => row.length !== n))
    throw new Error(
      `Use diag(a,b,…) or a ${n}×${n} matrix with comma-separated entries and semicolon-separated rows.`,
    );
  const ast = entries.map((row) =>
    row.map((value) => parseExpression(value.trim(), coordinates)),
  );
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (expressionText(ast[i][j]) !== expressionText(ast[j][i]))
        throw new Error(
          'Symmetric metric entries must use the same expression on both sides of the diagonal.',
        );
    }
  const first = coordinates.map((name) =>
    ast.map((row) => row.map((node) => differentiate(node, name))),
  );
  const second = coordinates.map((name) =>
    first.map((layer) =>
      layer.map((row) => row.map((node) => differentiate(node, name))),
    ),
  );
  function evaluateAt(point: number[], curvature = true) {
    if (point.length !== n)
      throw new Error('Metric coordinate dimension mismatch.');
    finite(point, 'Coordinates');
    const scope = Object.fromEntries(
      coordinates.map((name, i) => [name, point[i]]),
    );
    const values = (nodes: Expr[][]) =>
      nodes.map((row) => row.map((node) => evaluate(node, scope)));
    const g = values(ast);
    const scale = Math.max(...g.flat().map(Math.abs));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(g[i][j] - g[j][i]) > 1e-11 * scale)
          throw new Error('Metric must be symmetric.');
      }
    const inv = inverse(g),
      eigenvalues = signature(g);
    if (
      eigenvalues.some((v) => Math.abs(v) < 1e-12) ||
      eigenvalues.filter((v) => v < 0).length !== 1
    )
      throw new Error(
        'Metric must have Lorentz signature (one negative and the remaining positive eigenvalues).',
      );
    const dg = first.map(values);
    // Gamma[a][b][c] = 1/2 g^(ad) (g_dc,b + g_db,c - g_bc,d).
    const gamma = Array.from({ length: n }, (_, a) =>
      matrix(n, (b, c) =>
        inv[a].reduce(
          (sum, v, d) =>
            sum + (v * (dg[b][d][c] + dg[c][d][b] - dg[d][b][c])) / 2,
          0,
        ),
      ),
    );
    finite(gamma.flat(2), 'Connection');
    let ricci = matrix(n, () => 0),
      scalar = 0;
    if (curvature) {
      const ddg = second.map((layer) => layer.map(values));
      const dinv = dg.map((layer) =>
        matrix(
          n,
          (a, b) =>
            -inv[a].reduce(
              (sum, v, i) =>
                sum +
                v * layer[i].reduce((inner, d, j) => inner + d * inv[j][b], 0),
              0,
            ),
        ),
      );
      const dgamma = coordinates.map((_, k) =>
        Array.from({ length: n }, (_, a) =>
          matrix(n, (b, c) =>
            inv[a].reduce(
              (sum, v, d) =>
                sum +
                (dinv[k][a][d] * (dg[b][d][c] + dg[c][d][b] - dg[d][b][c]) +
                  v * (ddg[k][b][d][c] + ddg[k][c][d][b] - ddg[k][d][b][c])) /
                  2,
              0,
            ),
          ),
        ),
      );
      ricci = matrix(n, (a, b) => {
        let value = 0;
        for (let c = 0; c < n; c++) {
          value += dgamma[c][c][a][b] - dgamma[b][c][a][c];
          for (let d = 0; d < n; d++)
            value +=
              gamma[c][a][b] * gamma[d][c][d] - gamma[d][a][c] * gamma[c][b][d];
        }
        return value;
      });
      scalar = inv.reduce(
        (sum, row, a) => sum + row.reduce((s, v, b) => s + v * ricci[a][b], 0),
        0,
      );
      finite([...ricci.flat(), scalar], 'Curvature');
    }
    return { g, inverse: inv, gamma, ricci, scalar };
  }
  return {
    coordinates,
    dimension: n,
    evaluateAt,
    symbolic: first.flatMap((layer, k) =>
      layer.flatMap((row, i) =>
        row
          .map((node, j) => ({
            label: `∂${coordinates[k]} g[${i},${j}]`,
            value: expressionText(node),
          }))
          .filter((entry) => entry.value !== '0'),
      ),
    ),
  };
}
export function metricNorm(g: Matrix, tangent: number[]): number {
  return finite(
    [
      g.reduce(
        (sum, row, i) =>
          sum + tangent[i] * row.reduce((s, x, j) => s + x * tangent[j], 0),
        0,
      ),
    ],
    'Tangent norm',
  )[0];
}
export function geodesicRhs(metric: Metric, state: number[]): number[] {
  const n = metric.dimension,
    u = state.slice(n);
  const { gamma } = metric.evaluateAt(state.slice(0, n), false);
  return [
    ...u,
    ...gamma.map(
      (layer) =>
        -layer.reduce(
          (sum, row, b) =>
            sum + row.reduce((s, v, c) => s + v * u[b] * u[c], 0),
          0,
        ),
    ),
  ];
}
