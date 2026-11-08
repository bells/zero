export const webCategories = ['development', 'image', 'text', 'date-calculation'] as const;
export type WebCategory = typeof webCategories[number];
export type CategoryFilter = 'all' | WebCategory;
export const categoryLabels = { zh: { all: '全部', development: '开发类', image: '图片类', text: '文本类', 'date-calculation': '日期与计算' }, en: { all: 'All', development: 'Development', image: 'Images', text: 'Text', 'date-calculation': 'Dates & calculations' } } as const;
export function parseCategory(value: string | null): CategoryFilter { return value === 'development' || value === 'image' || value === 'text' || value === 'date-calculation' ? value : 'all'; }
