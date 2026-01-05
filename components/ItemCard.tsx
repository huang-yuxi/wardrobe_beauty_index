
import React from 'react';
import { CatalogItem } from '../types';
import { RefillBadge } from './RefillBadge';

interface ItemCardProps {
  item: CatalogItem;
  onClick: (item: CatalogItem) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onClick }) => {
  const isBeauty = item.type === 'beauty';

  return (
    <div 
      onClick={() => onClick(item)}
      className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-100 group"
    >
      <div className="aspect-[3/4] bg-gray-50 relative overflow-hidden">
        {item.imageUrl ? (
          <img 
            src={item.imageUrl} 
            alt={item.name} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-200">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* Only show status badge for beauty/skincare items */}
        {isBeauty && (
          <div className="absolute top-2 right-2">
            <RefillBadge status={item.status} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="p-3">
        <div className="flex justify-between items-start gap-2 mb-1">
          <p className="text-[10px] uppercase tracking-[0.1em] text-gray-400 font-bold leading-none">{item.brand || 'Personal'}</p>
        </div>
        <h3 className="text-sm font-semibold text-gray-800 truncate leading-tight mb-0.5">{item.name}</h3>
        <p className="text-[11px] text-gray-500 font-medium">{item.category}</p>
      </div>
    </div>
  );
};
