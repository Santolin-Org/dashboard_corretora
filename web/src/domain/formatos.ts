export const fBRL = (v: number): string => (!v && v !== 0) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v);
export const fN = (v: number): string => new Intl.NumberFormat('pt-BR').format(Math.round(v));
export const fP = (v: number): string => (v * 100).toFixed(2) + '%';
export const fPct = (v: number | null | undefined): string => v != null ? (v * 100).toFixed(2) + '%' : '—';
export const fShort = (v: number): string => v >= 1e6 ? 'R$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? 'R$' + (v / 1e3).toFixed(2) + 'k' : 'R$' + Math.round(v);
