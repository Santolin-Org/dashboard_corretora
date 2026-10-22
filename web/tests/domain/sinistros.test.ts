import { describe, it, expect } from 'vitest';
import { montarSinistros, mergeClaimsRows, parseSinistros, COL_SIN, type Sinistro } from '../../src/domain/sinistros/parse';
import { xlsxBuf } from './helpers';

const CAB = Object.values(COL_SIN);
const row = (id: string, sin: string, pago: number, data: string | number = '2026-03-01') =>
  [id, sin, data, data, '', 'Aberto', 'Allianz', 'Automóvel - Casco', 'Fulano', 100, pago, 0, 0, 0, 0, '', '', '', ''];

describe('sinistros', () => {
  it('conta por arquivo e mescla: dedup por Nº AVISO (ou Nº SINISTRO), o primeiro vence; sem chave sempre entra', () => {
    const av = xlsxBuf(CAB as unknown as string[], [row('AV1', 'S1', 0), row('AV2', 'S2', 0), row('', 'S9', 0), row('', '', 0), row('', '', 0)]);
    const pg = xlsxBuf(CAB as unknown as string[], [row('AV1', 'S1', 50), row('AV3', 'S3', 70), row('', 'S9', 1)]);
    const r = montarSinistros(av, pg);
    expect(r.contagens).toEqual({ sinistrosAvisados: 5, sinistrosPagamentos: 3 });
    expect(r.sinistros.map(s => s.id || s.sinNum)).toEqual(['AV1', 'AV2', 'S9', '', '', 'AV3']);
    expect(r.sinistros[0].pago).toBe(0); // venceu o avisado
    expect(montarSinistros(null, null)).toEqual({ sinistros: [], contagens: { sinistrosAvisados: 0, sinistrosPagamentos: 0 } });
  });
  it('parse: datas ISO, números e ramo canônico', () => {
    const [s] = parseSinistros(xlsxBuf(CAB as unknown as string[], [row('AV1', 'S1', 12.5, 45658)]));
    expect(s).toMatchObject({ id: 'AV1', sinNum: 'S1', abertura: '2025-01-01', pago: 12.5, valor: 100, seg: 'Allianz' });
  });
  it('mergeClaimsRows igual ao antigo', () => {
    const mk = (id: string): Sinistro => ({ id, sinNum: '' } as Sinistro);
    const t = [mk('a')];
    mergeClaimsRows(t, [mk('a'), mk('b'), mk('')]);
    expect(t.map(x => x.id)).toEqual(['a', 'b', '']);
  });
});
