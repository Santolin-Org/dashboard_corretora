import { describe, it, expect } from 'vitest';
import { aplicarCobertura, type FonteProducao } from '../../src/domain/producao/cobertura';
import { linha } from './helpers';

const muitas = (n: number, vig: string, ap = 'X') => Array.from({ length: n }, (_, i) => linha({ vig, apolice: `${ap}${i}` }));

describe('aplicarCobertura', () => {
  it('(a) o arquivo mais novo cobre o ano e o mais antigo perde as linhas daquele ano', () => {
    const A: FonteProducao = { nome: 'producao_2025.xlsx', modificadoEm: '2026-01-10T00:00:00Z', linhas: muitas(100, '2025-05-05', 'a') };
    const B: FonteProducao = { nome: 'producao_2026.xlsx', modificadoEm: '2026-10-01T00:00:00Z',
      linhas: [...muitas(100, '2025-05-05', 'b'), ...muitas(10, '2026-02-02', 'c')] };
    const r = aplicarCobertura([A, B]);
    expect(r.fontes[0].linhas).toHaveLength(0);
    expect(r.fontes[1].linhas).toHaveLength(110);
    expect(r.manifesto[0].anosIgnorados).toEqual([{ ano: 2025, cobertoPor: 'producao_2026.xlsx' }]);
    expect(r.manifesto[1].anosIgnorados).toEqual([]);
    expect(r.fontes.map(f => f.nome)).toEqual(['producao_2025.xlsx', 'producao_2026.xlsx']);
  });
  it('(b) linha perdida de 2021 dentro do arquivo novo: nada sai, só aviso de sobreposição nas duas', () => {
    const A: FonteProducao = { nome: 'producao_2021.xlsx', modificadoEm: '2026-01-10T00:00:00Z', linhas: muitas(200, '2021-04-01') };
    const B: FonteProducao = { nome: 'producao_2026.xlsx', modificadoEm: '2026-10-01T00:00:00Z',
      linhas: [...muitas(1, '2021-05-17', 'z'), ...muitas(50, '2026-02-02')] };
    const r = aplicarCobertura([A, B]);
    expect(r.fontes[0].linhas).toHaveLength(200);
    expect(r.fontes[1].linhas).toHaveLength(51);
    expect(r.manifesto[0].anosIgnorados).toEqual([]);
    expect(r.manifesto[0].sobreposicoes).toEqual([{ ano: 2021, com: 'producao_2026.xlsx', linhas: 200 }]);
    expect(r.manifesto[1].sobreposicoes).toEqual([{ ano: 2021, com: 'producao_2021.xlsx', linhas: 1 }]);
  });
  it('transbordo de fronteira: 5 linhas de 2025 em 100 do arquivo antigo, dona com 100 → nada sai, aviso nas duas', () => {
    const A: FonteProducao = { nome: 'producao_2024.xlsx', modificadoEm: '2026-01-10T00:00:00Z', linhas: [...muitas(95, '2024-05-05', 'a'), ...muitas(5, '2025-01-02', 'f')] };
    const B: FonteProducao = { nome: 'producao_2026.xlsx', modificadoEm: '2026-10-01T00:00:00Z', linhas: muitas(100, '2025-05-05', 'b') };
    const r = aplicarCobertura([A, B]);
    expect(r.fontes[0].linhas).toHaveLength(100);
    expect(r.manifesto[0].anosIgnorados).toEqual([]);
    expect(r.manifesto[0].sobreposicoes).toEqual([{ ano: 2025, com: 'producao_2026.xlsx', linhas: 5 }]);
    expect(r.manifesto[1].sobreposicoes).toEqual([{ ano: 2025, com: 'producao_2024.xlsx', linhas: 100 }]);
  });
  it('modificadoEm vazio ou inválido nunca é dono sobre uma data válida', () => {
    const mk = (nome: string, modificadoEm: string): FonteProducao => ({ nome, modificadoEm, linhas: muitas(100, '2025-05-05', nome) });
    for (const ruim of ['', 'lixo']) {
      const r = aplicarCobertura([mk('novo.xlsx', '2026-10-01T00:00:00Z'), mk('semdata.xlsx', ruim)]);
      expect(r.fontes[0].linhas).toHaveLength(100);
      expect(r.fontes[1].linhas).toHaveLength(0);
      expect(r.manifesto[1].anosIgnorados).toEqual([{ ano: 2025, cobertoPor: 'novo.xlsx' }]);
    }
  });
  it('(c) sem sobreposição a saída é igual à entrada', () => {
    const fs: FonteProducao[] = [
      { nome: 'producao_2024.xlsx', modificadoEm: '2026-01-10T00:00:00Z', linhas: muitas(5, '2024-01-01') },
      { nome: 'producao_2025.xlsx', modificadoEm: '2026-02-10T00:00:00Z', linhas: muitas(5, '2025-01-01') },
    ];
    const r = aplicarCobertura(fs);
    expect(r.fontes).toEqual(fs);
    expect(r.manifesto.every(m => !m.anosIgnorados.length && !m.sobreposicoes.length)).toBe(true);
  });
  it('limite de 50%: exatamente metade ainda cobre; linhas sem vigência nunca são tocadas', () => {
    const A: FonteProducao = { nome: 'a.xlsx', modificadoEm: '2026-01-01T00:00:00Z', linhas: [...muitas(10, '2025-01-01'), linha({ vig: '' })] };
    const B: FonteProducao = { nome: 'b.xlsx', modificadoEm: '2026-02-01T00:00:00Z', linhas: muitas(5, '2025-01-01', 'q') };
    const r = aplicarCobertura([A, B]);
    expect(r.fontes[0].linhas).toHaveLength(1);
    expect(r.fontes[0].linhas[0].vig).toBe('');
  });
});
