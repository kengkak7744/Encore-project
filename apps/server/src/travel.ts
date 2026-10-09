
const cityCodes: Record<string, string> = {
  'กรุงเทพมหานคร': 'BKK', 'กรุงเทพ': 'BKK', 'bangkok': 'BKK',
  'เชียงใหม่': 'CNX', 'chiang mai': 'CNX', 'ภูเก็ต': 'HKT', 'phuket': 'HKT',
  'หาดใหญ่': 'HDY', 'hat yai': 'HDY', 'ขอนแก่น': 'KKC', 'khon kaen': 'KKC',
  'สิงคโปร์': 'SIN', 'singapore': 'SIN', 'โตเกียว': 'TYO', 'tokyo': 'TYO',
  'โซล': 'SEL', 'seoul': 'SEL',
};
export function cityCode(city: string) { return /^[A-Za-z]{3}$/.test(city.trim()) ? city.trim().toUpperCase() : cityCodes[city.trim().toLowerCase()]; }
