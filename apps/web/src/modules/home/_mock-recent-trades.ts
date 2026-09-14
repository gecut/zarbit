export interface RecentTradeItem {
  id: string;
  time: string;
  price: number;
  units: number;
  delta: number;
}

export const mockRecentTrades: RecentTradeItem[] = [
  { id: "trade-1", time: "۱۸:۵۴:۲۰", price: 105040, units: 2, delta: 20 },
  { id: "trade-2", time: "۱۸:۵۱:۰۵", price: 105020, units: 5, delta: 0 },
  { id: "trade-3", time: "۱۸:۴۸:۳۰", price: 105050, units: 1, delta: 30 },
  { id: "trade-4", time: "۱۸:۴۵:۱۵", price: 105010, units: 3, delta: -10 },
  { id: "trade-5", time: "۱۸:۴۲:۰۰", price: 105000, units: 4, delta: -20 },
  { id: "trade-6", time: "۱۸:۳۹:۴۰", price: 105030, units: 2, delta: 10 },
  { id: "trade-7", time: "۱۸:۳۶:۱۲", price: 105020, units: 8, delta: 0 },
  { id: "trade-8", time: "۱۸:۳۳:۵۵", price: 104990, units: 1, delta: -30 },
  { id: "trade-9", time: "۱۸:۳۱:۲۰", price: 105060, units: 6, delta: 40 },
  { id: "trade-10", time: "۱۸:۲۸:۴۵", price: 105010, units: 2, delta: -10 },
];
