
import React from 'react';
import { RefillStatus } from '../types';

interface RefillBadgeProps {
  status: RefillStatus;
}

export const RefillBadge: React.FC<RefillBadgeProps> = ({ status }) => {
  const styles = {
    'in-stock': 'bg-green-100 text-green-700 border-green-200',
    'low': 'bg-amber-100 text-amber-700 border-amber-200',
    'out': 'bg-red-100 text-red-700 border-red-200',
  };

  const labels = {
    'in-stock': 'In Stock',
    'low': 'Running Low',
    'out': 'Refill Needed',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};
