import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { TrendingUp, ExternalLink, AlertCircle } from 'lucide-react';

interface CompetitorPrice {
  platform: string;
  price: number;
  url: string;
}

interface MarketIntelligenceProps {
  prices: CompetitorPrice[];
  currentPrice: string;
}

export const MarketIntelligence: React.FC<MarketIntelligenceProps> = ({ prices, currentPrice }) => {
  const priceStr = currentPrice || '0';
  const numericCurrentPrice = parseInt(priceStr.replace(/[^0-9]/g, '')) || 0;
  
  const data = [
    ...prices.map(p => ({
      name: p.platform,
      price: p.price,
      isCurrent: false,
      url: p.url
    })),
    {
      name: 'Your Price',
      price: numericCurrentPrice,
      isCurrent: true,
      url: '#'
    }
  ].sort((a, b) => a.price - b.price);

  const averagePrice = prices.length > 0 
    ? prices.reduce((acc, curr) => acc + curr.price, 0) / prices.length 
    : numericCurrentPrice;

  const priceDiff = ((numericCurrentPrice - averagePrice) / averagePrice) * 100;

  return (
    <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
      <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold">Market Intelligence</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${priceDiff > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {priceDiff > 0 ? '+' : ''}{priceDiff.toFixed(1)}% vs Market
          </span>
        </div>
      </div>

      <div className="p-6 space-y-8">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 600, fill: '#888' }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 600, fill: '#888' }}
                tickFormatter={(value) => `₹${value}`}
              />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-stone-900 text-white p-3 rounded-xl shadow-xl border border-stone-800 text-xs">
                        <p className="font-bold mb-1">{data.name}</p>
                        <p className="text-emerald-400 font-bold">₹{data.price}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="price" radius={[8, 8, 0, 0]} barSize={40}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.isCurrent ? '#059669' : '#e5e7eb'} 
                    className="transition-all duration-300 hover:opacity-80"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Competitor Links</h4>
          <div className="grid grid-cols-1 gap-2">
            {prices.map((p, i) => (
              <a 
                key={i} 
                href={p.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl hover:bg-stone-100 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-[10px] font-bold text-stone-400 uppercase">
                    {p.platform.substring(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{p.platform}</p>
                    <p className="text-xs text-stone-500">Live Price: ₹{p.price}</p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-stone-300 group-hover:text-stone-600 transition-colors" />
              </a>
            ))}
            {prices.length === 0 && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl text-amber-700">
                <AlertCircle className="w-5 h-5" />
                <p className="text-sm font-medium">No direct competitors found in recent search.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
