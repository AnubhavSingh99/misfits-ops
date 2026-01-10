import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const dotRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (dotRef.current && showTooltip) {
      const rect = dotRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2
      });
      setIsHovered(true);
    }
  }, [showTooltip]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  return (
    <div className="relative inline-block">
      {/* Button with generous padding for easier hovering */}
      <button
        type="button"
        ref={dotRef}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClick?.();
        }}
        onMouseEnter={(e) => {
          e.stopPropagation();
          handleMouseEnter();
        }}
        onMouseLeave={(e) => {
          e.stopPropagation();
          handleMouseLeave();
        }}
        className="p-2 cursor-pointer flex items-center justify-center"
      >
        <div className={`
          ${sizeClasses[size]}
          ${colors.bg}
          rounded-full
          ring-1 ring-white
          transition-all duration-200 ease-out
          hover:scale-125 hover:ring-2 ${colors.ring}
          ${colors.glow}
          ${className}
        `} />
      </button>

      {/* Portal-based tooltip to escape overflow containers */}
      {showTooltip && isHovered && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="px-2 py-1 rounded-md bg-gray-900 text-white text-[10px] font-medium whitespace-nowrap">
            {label}
            {score !== undefined && (
              <span className="text-gray-400 ml-1">({score})</span>
            )}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-4 border-transparent border-t-gray-900" />
          </div>
        </div>,
        document.body
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
