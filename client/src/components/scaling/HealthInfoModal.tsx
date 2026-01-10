import React from 'react';
import { X } from 'lucide-react';

interface HealthInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HealthInfoModal({ isOpen, onClose }: HealthInfoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="
        relative z-10 w-full max-w-lg mx-4
        bg-white rounded-2xl shadow-2xl
        animate-in fade-in zoom-in-95 duration-200
      ">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Health Calculation</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Score Formula */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Score Formula
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 w-32">Established clubs:</span>
                <code className="text-xs bg-white px-2 py-1 rounded border border-gray-200">
                  Capacity(30%) + Repeat(40%) + Rating(30%)
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 w-32">New clubs (&lt;2mo):</span>
                <code className="text-xs bg-white px-2 py-1 rounded border border-gray-200">
                  Capacity(60%) + Rating(40%)
                </code>
              </div>
            </div>
          </section>

          {/* Thresholds */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Metric Thresholds
            </h3>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Metric</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Green
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-center font-semibold text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Yellow
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-center font-semibold text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        Red
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-gray-700">Capacity</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">&ge;75%</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">50-74%</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">&lt;50%</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-gray-700">Repeat Rate</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">&ge;65%</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">50-64%</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">&lt;50%</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-gray-700">Rating</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">&ge;4.7</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">4.4-4.69</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">&lt;4.4</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Status Mapping */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Score to Status
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 bg-emerald-50 rounded-lg px-3 py-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-emerald-700">Healthy</span>
                <span className="text-xs text-emerald-600 ml-auto">&ge;70</span>
              </div>
              <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-xs font-medium text-amber-700">At Risk</span>
                <span className="text-xs text-amber-600 ml-auto">50-69</span>
              </div>
              <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-xs font-medium text-red-700">Critical</span>
                <span className="text-xs text-red-600 ml-auto">&lt;50</span>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                <span className="text-xs font-medium text-gray-700">Dormant</span>
                <span className="text-xs text-gray-600 ml-auto">No events</span>
              </div>
            </div>
          </section>

          {/* Roll-up */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Roll-up Logic
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-xs text-gray-600">
              <p>
                <span className="font-medium text-gray-700">Parent score</span> = Weighted average of children's health scores
              </p>
              <div className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                <span className="font-medium text-gray-700">Weight</span> = Club's avg meetups/week over last 4 weeks
                <p className="text-[10px] text-gray-500 mt-1">More active clubs have greater influence on roll-up health</p>
              </div>
              <p>
                <span className="font-medium text-gray-700">New club launches</span> are excluded from health calculations
              </p>
              <p>Same thresholds apply for determining status color</p>
            </div>
          </section>

          {/* Exclusions */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Booking Exclusions
            </h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">DEREGISTERED</span>
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">INITIATED</span>
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">WAITLISTED</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              These booking states are excluded from capacity and repeat rate calculations.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-gray-900 text-white text-sm font-medium rounded-lg
              hover:bg-gray-800 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export default HealthInfoModal;
