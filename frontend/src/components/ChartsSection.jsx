import React from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import styles from '../styles/ChartsSection.module.css';
import { getMetricByKey, getPerformanceMetrics } from '../utils/metrics';

/* ── Vibrant color palette for dark theme ── */
const BAR_COLORS = [
  '#06d6a0', // emerald
  '#118ab2', // ocean blue
  '#7209b7', // violet
  '#f72585', // hot pink
  '#4cc9f0', // sky cyan
  '#ff6b35', // tangerine
  '#3a86ff', // vivid blue
  '#8338ec', // purple
  '#fb5607', // orange
  '#06d6a0', // emerald (repeat)
];
const BAR_DISABLED = 'rgba(255,255,255,0.12)';

const DONUT_ACHIEVED = '#06d6a0';
const DONUT_REMAINING = 'rgba(255,255,255,0.08)';

const RADAR_FILL = '#4cc9f0';
const RADAR_STROKE = '#06d6a0';

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '10px',
  color: '#e2e8f0',
  fontSize: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

/* Abbreviate long metric labels so they fit under the bars */
const SHORT_LABELS = {
  'Quality': 'Quality',
  'Empathy': 'Empathy',
  'Professionalism': 'Profess.',
  'Compliance': 'Comply.',
  'Language Proficiency': 'Lang.',
  'Efficiency': 'Effic.',
  'Bias Reduction': 'Bias Red.',
  'Sales Opportunity': 'Sales',
};

function shorten(label) {
  return SHORT_LABELS[label] ?? (label.length > 8 ? label.slice(0, 7) + '.' : label);
}

/* Custom bar label rendered above each bar */
function BarLabel({ x, y, width, value, payload }) {
  if (!payload?.evaluated) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      fill="rgba(255,255,255,0.7)"
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
    >
      {Math.round(value)}
    </text>
  );
}

export default function ChartsSection({ result }) {
  const performanceMetrics = getPerformanceMetrics(result);
  const qualityMetric = getMetricByKey(performanceMetrics, 'quality_score');
  const qualityScore = qualityMetric?.value ?? 0;

  const metricBarData = performanceMetrics.map((metric) => ({
    name: metric.label,
    shortName: shorten(metric.label),
    value: metric.chartValue,
    evaluated: metric.evaluated,
  }));

  const radarKeys = [
    'empathy_score',
    'language_proficiency_score',
    'efficiency_score',
    'bias_reduction_score',
  ];

  const radarData = performanceMetrics
    .filter((metric) => radarKeys.includes(metric.key) && metric.evaluated)
    .map((metric) => ({ metric: metric.label, score: metric.value }));

  const qualityDistribution = [
    { name: 'Achieved', value: qualityScore },
    { name: 'Remaining', value: Math.max(0, 100 - qualityScore) },
  ];

  return (
    <div className={styles.chartsSection}>
      <div className={styles.chartsGrid}>

        {/* ── Bar chart ── */}
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Performance Metrics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metricBarData} margin={{ top: 16, right: 8, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="shortName"
                stroke="rgba(255,255,255,0.4)"
                interval={0}
                angle={-40}
                textAnchor="end"
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.55)' }}
                height={52}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                domain={[0, 100]}
                tickCount={6}
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(value, _, item) => {
                  if (!item?.payload?.evaluated) {
                    return ['Not Evaluated', item.payload.name];
                  }
                  return [`${Math.round(value)} / 100`, item.payload.name];
                }}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={28} label={<BarLabel />}>
                {metricBarData.map((entry, index) => (
                  <Cell
                    key={`metric-${index}`}
                    fill={entry.evaluated ? BAR_COLORS[index % BAR_COLORS.length] : BAR_DISABLED}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Donut chart ── */}
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Overall Quality</h3>
          <div className={styles.donutWrapper}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={qualityDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={105}
                  paddingAngle={3}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  <Cell fill={DONUT_ACHIEVED} />
                  <Cell fill={DONUT_REMAINING} />
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.donutCenter}>
              <span className={styles.donutScore}>{qualityScore.toFixed(0)}</span>
              <span className={styles.donutLabel}>/ 100</span>
            </div>
          </div>
          <div className={styles.chartLegend}>
            <p className={styles.legendItem}>
              <span className={styles.dot} style={{ backgroundColor: DONUT_ACHIEVED }} />
              Achieved: {qualityScore.toFixed(1)}%
            </p>
            <p className={styles.legendItem}>
              <span className={styles.dot} style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
              Remaining: {(Math.max(0, 100 - qualityScore)).toFixed(1)}%
            </p>
          </div>
        </div>

        {/* ── Radar chart ── */}
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Skill Profile</h3>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 500 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
                  axisLine={false}
                />
                <Radar
                  name="Skill"
                  dataKey="score"
                  fill={RADAR_FILL}
                  fillOpacity={0.25}
                  stroke={RADAR_STROKE}
                  strokeWidth={2}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.notEvaluatedMessage}>
              Skill profile unavailable: no evaluated proficiency, efficiency, or bias-reduction metrics.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
