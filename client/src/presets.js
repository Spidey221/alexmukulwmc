// Demo presets (Section 14). Hardcoded as a frontend constant -- there is
// no /api/presets endpoint by design (Section 2, Section 9).
export const PRESETS = [
  {
    name: 'Good Network, Heavy Task',
    inputs: {
      data_size_mb: 0.5,
      compute_demand_mi: 2000,
      deadline_ms: 1000,
      congestion_level: 0,
      battery_priority: 0.2,
    },
  },
  {
    name: 'Moderate Congestion',
    inputs: {
      data_size_mb: 0.5,
      compute_demand_mi: 500,
      deadline_ms: 300,
      congestion_level: 0.5,
      battery_priority: 0.2,
    },
  },
  {
    name: 'Severe Congestion',
    inputs: {
      data_size_mb: 0.5,
      compute_demand_mi: 500,
      deadline_ms: 300,
      congestion_level: 0.9,
      battery_priority: 0.2,
    },
  },
  {
    name: 'High Battery Priority, Data-Heavy Task',
    inputs: {
      data_size_mb: 3,
      compute_demand_mi: 100,
      deadline_ms: 2000,
      congestion_level: 0.2,
      battery_priority: 0.95,
    },
  },
];

export const DEFAULT_INPUTS = {
  data_size_mb: 0.5,
  compute_demand_mi: 300,
  deadline_ms: 250,
  congestion_level: 0.3,
  battery_priority: 0.2,
};

export const INPUT_RANGES = {
  data_size_mb: { min: 0.05, max: 5 },
  compute_demand_mi: { min: 50, max: 3000 },
  deadline_ms: { min: 20, max: 2000 },
  congestion_level: { min: 0, max: 1 },
  battery_priority: { min: 0, max: 1 },
};
