export const webCategories = ['development', 'image'] as const;
export type WebCategory = typeof webCategories[number];
export type CategoryFilter = 'all' | WebCategory;
export const categoryLabels = { zh: { all: '全部', development: '开发类', image: '图片类' }, en: { all: 'All', development: 'Development', image: 'Images' } } as const;
export function parseCategory(value: string | null): CategoryFilter { return value === 'development' || value === 'image' ? value : 'all'; }
