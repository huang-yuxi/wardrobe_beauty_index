
export type ItemType = 'clothing' | 'beauty';

export type RefillStatus = 'in-stock' | 'low' | 'out';

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter' | 'All-Season';

export interface CatalogItem {
  id: string;
  name: string;
  brand: string;
  type: ItemType;
  category: string;
  status: RefillStatus;
  color?: string;
  season?: Season[];
  openedDate?: string; // ISO date for beauty products
  expiryMonths?: number; // Months after opening
  imageUrl?: string;
  notes?: string;
  lastUpdated: number;
}

export interface AnalysisResult {
  name: string;
  brand: string;
  category: string;
  description: string;
}

export interface BatchItem {
  name: string;
  brand: string;
  category: string;
  type: ItemType;
  notes: string;
  selected: boolean;
}
