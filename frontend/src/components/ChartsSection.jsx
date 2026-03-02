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
} from 'recharts';
import styles from '../styles/ChartsSection.module.css';
import { getMetricByKey, getPerformanceMetrics } from '../utils/metrics';

export default function ChartsSection({ result }) {
  const performanceMetrics = getPerformanceMetrics(result);
  const qualityMetric = getMetricByKey(performanceMetrics, 'quality_score');
  const qualityScore = qualityMetric?.value ?? 0;

  const metricBarData = performanceMetrics.map((metric) => ({
    name: metric.label,
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
    { name: 'Quality Score', value: qualityScore },
    { name: 'Remaining', value: Math.max(0, 100 - qualityScore) },
  ];

  const colors = ['#0B1F3B', '#C6A84F'];

  return (
    <div className={styles.chartsSection}>
      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Performance Metrics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metricBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E0D5" />
              <XAxis
                dataKey="name"
                stroke="#6B7280"
                interval={0}
                angle={-24}
                textAnchor="end"
                tick={{ fontSize: 11 }}
                height={76}
              />
              <YAxis stroke="#6B7280" domain={[0, 100]} tickCount={6} />
              <Tooltip
                formatter={(value, _, item) => {
                  if (!item?.payload?.evaluated) {
                    return ['Not Evaluated', item.payload.name];
                  }
                  return [`${Math.round(value)} / 100`, item.payload.name];
                }}
                contentStyle={{
                  backgroundColor: '#F8F6F1',
                  border: '1px solid #E5E0D5',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {metricBarData.map((entry, index) => (
                  <Cell key={`metric-${index}`} fill={entry.evaluated ? '#0B1F3B' : '#C9C4B8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Overall Quality</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={qualityDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {qualityDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#F8F6F1',
                  border: '1px solid #E5E0D5',
                  borderRadius: '8px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className={styles.chartLegend}>
            <p className={styles.legendItem}>
              <span className={styles.dot} style={{ backgroundColor: colors[0] }} />
              Achieved: {qualityScore.toFixed(1)}%
            </p>
            <p className={styles.legendItem}>
              <span className={styles.dot} style={{ backgroundColor: colors[1] }} />
              Remaining: {(Math.max(0, 100 - qualityScore)).toFixed(1)}%
            </p>
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Skill Profile</h3>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#E5E0D5" />
                <PolarAngleAxis dataKey="metric" stroke="#6B7280" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#6B7280" />
                <Radar name="Skill" dataKey="score" fill="#C6A84F" fillOpacity={0.35} stroke="#0B1F3B" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#F8F6F1',
                    border: '1px solid #E5E0D5',
                    borderRadius: '8px',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.notEvaluatedMessage}>Skill profile unavailable: no evaluated proficiency, efficiency, or bias-reduction metrics.</div>
          )}
        </div>
      </div>
    </div>
  );
}
