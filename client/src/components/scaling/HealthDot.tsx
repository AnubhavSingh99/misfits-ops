import React from 'react';

export type HealthStatus = 'green' | 'yellow' | 'red' | 'gray';

interface HealthDotProps {
  status: HealthStatus;
  size?: 'sm' | 'md' | 'lg';
  score?: number;
  onClick?: () => void;
  showTooltip?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3'
};

const statusColors: Record<HealthStatus, { bg: string; ring: string; glow: string }> = {
  green: {
    bg: 'bg-emerald-500',
    ring: 'ring-emerald-200',
    glow: 'hover:shadow-[0_0_8px_2px_rgba(16,185,129,0.4)]'
  },
  yellow: {
    bg: 'bg-amber-500',
    ring: 'ring-amber-200',
    glow: 'hover:shadow-[0_0_8px_2px_rgba(245,158,11,0.4)]'
  },
  red: {
    bg: 'bg-red-500',
    ring: 'ring-red-200',
    glow: 'hover:shadow-[0_0_8px_2px_rgba(239,68,68,0.4)]'
  },
  gray: {
    bg: 'bg-gray-400',
    ring: 'ring-gray-200',
    glow: 'hover:shadow-[0_0_8px_2px_rgba(156,163,175,0.4)]'
  }
};

const statusLabels: Record<HealthStatus, string> = {
  green: 'Healthy',
  yellow: 'At Risk',
  red: 'Critical',
  gray: 'Dormant'
};

export function HealthDot({
  status,
  size = 'md',
  score,
  onClick,
  showTooltip = true,
  className = ''
}: HealthDotProps) {
  const colors = statusColors[status];
  const label = statusLabels[status];

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`
          ${sizeClasses[size]}
          ${colors.bg}
          rounded-full
          ring-1 ring-white
          cursor-pointer
          transition-all duration-200 ease-out
          hover:scale-125 hover:ring-2 ${colors.ring}
          ${colors.glow}
          ${className}
        `}
        title={showTooltip ? `${label}${score !== undefined ? ` (${score})` : ''}` : undefined}
      />

      {/* Hover tooltip */}
      {showTooltip && (
        <div className="
          absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          px-2 py-1 rounded-md
          bg-gray-900 text-white text-[10px] font-medium
          opacity-0 group-hover:opacity-100
          transition-opacity duration-150
          whitespace-nowrap
          pointer-events-none
          z-50
        ">
          {label}
          {score !== undefined && (
            <span className="text-gray-400 ml-1">({score})</span>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      )}
    </div>
  );
}

// Distribution bar for roll-up nodes
interface HealthDistributionBarProps {
  distribution: {
    green: number;
    yellow: number;
    red: number;
    gray: number;
  };
  compact?: boolean;
}

export function HealthDistributionBar({ distribution, compact = false }: HealthDistributionBarProps) {
  const total = distribution.green + distribution.yellow + distribution.red + distribution.gray;
  if (total === 0) return null;

  const segments = [
    { key: 'green', count: distribution.green, color: 'bg-emerald-500' },
    { key: 'yellow', count: distribution.yellow, color: 'bg-amber-500' },
    { key: 'red', count: distribution.red, color: 'bg-red-500' },
    { key: 'gray', count: distribution.gray, color: 'bg-gray-400' }
  ].filter(s => s.count > 0);

  return (
    <div className={`flex items-center gap-1.5 ${compact ? '' : 'min-w-[80px]'}`}>
      <div className="flex h-1.5 flex-1 rounded-full overflow-hidden bg-gray-100">
        {segments.map(({ key, count, color }) => (
          <div
            key={key}
            className={`${color} transition-all duration-300`}
            style={{ width: `${(count / total) * 100}%` }}
          />
        ))}
      </div>
      {!compact && (
        <span className="text-[10px] text-gray-500 font-medium tabular-nums">
          {distribution.green}/{total}
        </span>
      )}
    </div>
  );
}

export default HealthDot;
