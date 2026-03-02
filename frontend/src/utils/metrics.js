const PERFORMANCE_METRIC_DEFINITIONS = [
  { key: 'quality_score', label: 'Quality', optionalEvaluation: false },
  { key: 'empathy_score', label: 'Empathy', optionalEvaluation: false },
  { key: 'professionalism_score', label: 'Professionalism', optionalEvaluation: false },
  { key: 'compliance_score', label: 'Compliance', optionalEvaluation: false },
  { key: 'language_proficiency_score', label: 'Language Proficiency', optionalEvaluation: true },
  { key: 'efficiency_score', label: 'Efficiency', optionalEvaluation: true },
  { key: 'bias_reduction_score', label: 'Bias Reduction', optionalEvaluation: true },
  { key: 'sales_opportunity_score', label: 'Sales Opportunity', optionalEvaluation: true },
];

const toNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

export const normalizePerformanceMetric = (value, optionalEvaluation = false) => {
  const numericValue = toNumber(value);

  if (numericValue === null) {
    return {
      evaluated: false,
      value: null,
      chartValue: 0,
      displayValue: null,
    };
  }

  const normalizedValue = Math.max(0, Math.min(100, numericValue));

  if (optionalEvaluation && normalizedValue === 0) {
    return {
      evaluated: false,
      value: null,
      chartValue: 0,
      displayValue: null,
    };
  }

  return {
    evaluated: true,
    value: normalizedValue,
    chartValue: normalizedValue,
    displayValue: Math.round(normalizedValue),
  };
};

export const getPerformanceMetrics = (result) => {
  return PERFORMANCE_METRIC_DEFINITIONS.map((definition) => {
    const state = normalizePerformanceMetric(result?.[definition.key], definition.optionalEvaluation);
    return {
      ...definition,
      ...state,
    };
  });
};

export const getMetricByKey = (metrics, key) => {
  return metrics.find((metric) => metric.key === key);
};
