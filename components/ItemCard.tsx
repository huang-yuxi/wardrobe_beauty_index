
import React from 'react';
import { CatalogItem } from '../types';
import { RefillBadge } from './RefillBadge';

interface ItemCardProps {
  item: CatalogItem;
  onClick: (item: CatalogItem) => void;
}

const COLORS: Record<string, string> = {
  'Black': '#000000', 'White': '#FFFFFF', 'Beige': '#F5F5DC', 'Navy': '#000080', 
  'Grey': '#808080', 'Red': '#FF0000', 'Pink': '#FFC0CB', 'Gold': '#FFD700', 
  'Green': '#008000', 'Blue': '#0000FF'
};

export const ItemCard: React.FC<ItemCardProps> = ({ item, onClick }) => {
  const isBeauty = item.type === 'beauty';

  const isExpired = () => {
    if (!isBeauty || !item.openedDate || !item.expiryMonths) return false;
    const opened = new Date(item.openedDate);
    const expiryDate = new Date(opened.setMonth(opened.getMonth() + item.expiryMonths));
    return new Date() > expiryDate;
  };

  const seasons = Array.isArray(item.season) ? item.season : [item.season].filter(Boolean);

  return (
    <div 
      onClick={() => onClick(item)}
      className="bg-white rounded-[2rem] overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer border border-gray-50 group active:scale-95"
    >
      <div className="aspect-[3/4] bg-gray-50 relative overflow-hidden">
        {item.imageUrl ? (
          <img 
            src={item.imageUrl} 
            alt={item.name} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-200">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
        )}
        
        {isBeauty && (
          <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
            <RefillBadge status={item.status} />
            {isExpired() && (
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[8px] font-black uppercase tracking-tighter animate-pulse">
                ⚠️ Expired
              </span>
            )}
          </div>
        )}

        {item.color && (
          <div 
            className="absolute bottom-3 left-3 w-4 h-4 rounded-full border-2 border-white shadow-sm"
            style={{ backgroundColor: COLORS[item.color] || 'transparent' }}
          />
        )}

        {seasons.length > 0 && !isBeauty && (
          <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
             {seasons.map(s => (
                <span key={s} className="px-2 py-0.5 rounded-lg bg-white/90 backdrop-blur-md text-gray-900 text-[8px] font-bold uppercase tracking-widest border border-gray-100">
                  {s}
                </span>
             ))}
          </div>
        )}
      </div>
      
      <div className="p-4">
        <p className="text-[9px] uppercase tracking-[0.2em] text-gray-400 font-black leading-none mb-1.5">{item.brand || 'Personal'}</p>
        <h3 className="text-[13px] font-bold text-gray-800 truncate leading-tight mb-0.5">{item.name}</h3>
        <p className="text-[10px] text-gray-400 font-semibold">{item.category}</p>
      </div>
    </div>
  );
};
