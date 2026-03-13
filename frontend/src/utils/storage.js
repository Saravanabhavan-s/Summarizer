const HISTORY_KEY = 'call_quality_history';

export const saveCallResult = (result) => {
  try {
    const history = getCallHistory();
    const newEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...result
    };
    history.unshift(newEntry);
    // Keep only last 50 results
    const limitedHistory = history.slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(limitedHistory));
    return newEntry;
  } catch (error) {
    console.error('Error saving call result:', error);
  }
};

export const getCallHistory = () => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error retrieving call history:', error);
    return [];
  }
};

export const getLatestCallResult = () => {
  const history = getCallHistory();
  return history.length > 0 ? history[0] : null;
};

export const getCallResultById = (id) => {
  const history = getCallHistory();
  const target = String(id);
  return history.find((entry) => String(entry.id) === target);
};

export const deleteCallResult = (id) => {
  try {
    const history = getCallHistory();
    const target = String(id);
    const filtered = history.filter((entry) => String(entry.id) !== target);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting call result:', error);
  }
};

export const clearCallHistory = () => {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error('Error clearing history:', error);
  }
};
