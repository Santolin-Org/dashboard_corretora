import { describe, it, expect } from 'vitest';
import { PAINEIS_TV, PAINEL_TV_PADRAO, painelTv } from '../../src/domain/paineis-tv';
import { exibicaoTv } from '../../src/domain/exibicao-tv';
import { fBRL, fN } from '../../src/domain/formatos';
import { linha } from './helpers';

const HOJE = '2026-10-22';
const c = (colab: string, vig: string, com = 1000) =>
  linha({ campanha: 'SANTOLIN 360', colab, vig, com, apolice: colab + vig });

describe('painéis da Exibição TV', () => {
  it('cadastro: 360_tri3 (atual) e 360_tri4, com tri4 como padrão', () => {
    expect(PAINEIS_TV.map((p) => p.id)).toEqual(['360_tri3', '360_tri4']);
    expect(PAINEL_TV_PADRAO).toBe('360_tri4');
    const t3 = painelTv('360_tri3');
    expect([t3.inicio, t3.fim]).toEqual(['2026-07-01', '2026-09-30']);
    expect(t3.metas).toEqual([{ tipo: 'com', fases: [77000, 97000, 115000] }, { tipo: 'qtd', fases: [120, 150, 180] }]);
    const t4 = painelTv('360_tri4');
    expect([t4.inicio, t4.fim]).toEqual(['2026-10-01', '2026-12-31']);
    expect(t4.metas).toEqual([{ tipo: 'com', fases: [100000, 120000, 130000] }]);
    expect(t3.podios).toEqual(['qtd', 'com']);
    expect(t3.fotos).toBe(false);
    expect(t4.podios).toEqual(['com']);
    expect(t4.fotos).toBe(true);
  });

  it('360_tri4: pódio só por comissão, com o nome completo de cada colocado (para a foto)', () => {
    const rows = [c('Ana Paula Souza', '2026-10-05', 9000), c('Bruno Lima', '2026-10-06', 3000), c('Bruno Lima', '2026-10-07', 3000), c('Carla Dias', '2026-11-01', 1000)];
    const p = exibicaoTv(rows, HOJE, painelTv('360_tri4')).podio;
    expect(p.colunas.map((x) => x.titulo)).toEqual(['Top 3 — Resultado Gerado']);
    expect(p.colunas[0].nomes).toEqual(['Ana P.', 'Bruno L.', 'Carla D.']);
    expect(p.colunas[0].colabs).toEqual(['Ana Paula Souza', 'Bruno Lima', 'Carla Dias']);
  });

  it('360_tri3: os dois pódios de antes', () => {
    const rows = [c('Ana Paula', '2026-08-05', 9000)];
    const p = exibicaoTv(rows, HOJE, painelTv('360_tri3')).podio;
    expect(p.colunas.map((x) => x.titulo)).toEqual(['Top 3 — Negócios Realizados', 'Top 3 — Resultado Gerado']);
  });

  it('id desconhecido ou vazio cai no padrão', () => {
    expect(painelTv('xyz').id).toBe('360_tri4');
    expect(painelTv(null).id).toBe('360_tri4');
  });

  it('360_tri4: só a barra de comissão, fases 100k/120k/130k, período Out–Dez/2026', () => {
    const rows = [c('Ana Paula', '2026-09-30', 50000), c('Ana Paula', '2026-10-01', 80000), c('Bruno Lima', '2026-12-31', 30000), c('Bruno Lima', '2027-01-01', 999)];
    const d = exibicaoTv(rows, HOJE, painelTv('360_tri4'));
    expect(d.metasSantolin.qtd).toBeUndefined();
    const com = d.metasSantolin.com!;
    expect(com.valor).toBe(fBRL(110000)); // 80k + 30k; 30/09 e 01/01/2027 ficam fora
    expect(com.metaFinal).toBe(fBRL(130000));
    expect(com.marcadores.map((m) => [m.valor, m.atingida])).toEqual([[fBRL(100000), true], [fBRL(120000), false], [fBRL(130000), false]]);
    expect(com.badge).toBe('Fase 1 de 3 concluída');
    // Pódio no período do painel.
    expect(d.podio.colunas[0].nomes).toEqual(['Ana P.', 'Bruno L.', '—']);
  });

  it('360_tri3 continua igual ao de antes (duas barras, Jul–Set/2026)', () => {
    const rows = [c('Ana Paula', '2026-09-30', 50000), c('Ana Paula', '2026-10-01', 80000)];
    const d = exibicaoTv(rows, HOJE, painelTv('360_tri3'));
    expect(d.metasSantolin.com!.valor).toBe(fBRL(50000));
    expect(d.metasSantolin.qtd!.valor).toBe(fN(1));
    expect(exibicaoTv(rows, HOJE).metasSantolin.qtd!.valor).toBe(fN(1)); // sem painel: tri3, como antes
  });
});
