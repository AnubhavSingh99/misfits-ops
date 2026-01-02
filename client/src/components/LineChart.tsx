import React from 'react';

interface DataPoint {
  period: string;
  value: number;
}

interface LineChartProps {
  data: DataPoint[];
  color: string;
  label: string;
  formatter?: (value: number) => string;
}

export function LineChart({ data, color, label, formatter = (v) => v.toString() }: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-gray-400">
        <span>No data available</span>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  const width = 280;
  const height = 120;
  const padding = 20;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;

  // Calculate points for the line
  const points = data.map((item, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const y = padding + ((maxValue - item.value) / range) * chartHeight;
    return { x, y, value: item.value, period: item.period };
  });

  // Create path string for the line
  const pathData = points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ');

  // Create gradient area under the line
  const areaPath = pathData +
    ` L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <div className="w-full">
      <div className="mb-2">
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <svg width={width} height={height} className="overflow-visible">
        {/* Grid lines */}
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
          <line
            key={index}
            x1={padding}
            y1={padding + ratio * chartHeight}
            x2={width - padding}
            y2={padding + ratio * chartHeight}
            stroke="#f1f5f9"
            strokeWidth="1"
          />
        ))}

        {/* Area under the curve */}
        <path
          d={areaPath}
          fill={`url(#gradient-${color})`}
          stroke="none"
        />

        {/* Main line */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((point, index) => (
          <g key={index}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              fill="white"
              stroke={color}
              strokeWidth="2"
              className="hover:r-6 transition-all cursor-pointer"
            />
            {/* Tooltip on hover would go here */}
          </g>
        ))}
      </svg>

      {/* Data summary below chart */}
      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span>Min: {formatter(minValue)}</span>
        <span>Max: {formatter(maxValue)}</span>
        <span>{data.length} periods</span>
      </div>
    </div>
  );
}