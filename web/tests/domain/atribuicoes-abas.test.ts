import { describe, it, expect } from 'vitest';
import { linha } from './helpers';
import { FILTROS_VAZIOS, type FiltrosGlobais } from '../../src/domain/filtros';
import { aplicarAtribuicoes, type Atribuicao } from '../../src/domain/atribuicoes';
import { buildMetasEquipeCards, buildMetasGroupData, filtrarMetas, getMetasRealizadoData } from '../../src/domain/metas';
import { dadosComp, dadosKpisComp } from '../../src/domain/comparativo';
import { aRenovar } from '../../src/domain/painel-produtor';

// Fictício. ANA vendeu A1 como N em nov/2025 (vence 10/11/2026); a gestão atribuiu a renovação à BIA. A R nova saiu no
// nome do CAIO (divergente) mas conta para a BIA. ANA também tem A2, não atribuída.
const a1 = linha({ tipo: 'N', seg: 'S', apolice: 'A1', vig: '2025-11-10', fim: '2026-11-10', em: '2025-11-01', colab: 'ANA', sit: 'Renovada', docDigits: '111', ramo: 'Auto', premio: 1000, com: 100 });
const a1End = linha({ tipo: 'EN', seg: 'S', apolice: 'A1', endosso: '1', tipoDoc: 'ENDOSSO', vig: '2025-11-20', fim: '2026-11-10', em: '2025-11-15', colab: 'ANA', docDigits: '111', ramo: 'Auto', premio: 50, com: 5 });
const r1 = linha({ tipo: 'R', seg: 'S', apolice: 'R1', vig: '2026-11-10', fim: '2027-11-10', em: '2026-11-01', colab: 'CAIO', sit: 'Ativa', docDigits: '111', ramo: 'Auto', premio: 1200, com: 120 });
const a2 = linha({ tipo: 'N', seg: 'S', apolice: 'A2', vig: '2025-11-15', fim: '2026-11-15', em: '2025-11-02', colab: 'ANA', sit: 'Ativa', docDigits: '222', ramo: 'Auto', premio: 400, com: 40 });
const AT: Atribuicao = { seg: 'S', apolice: 'A1', fim: '2026-11-10', para: 'BIA', de: 'ANA', por: 'g', em: '' };
const L = aplicarAtribuicoes([a1, a1End, r1, a2], [AT]).linhas;
const NOV26: FiltrosGlobais = { ...FILTROS_VAZIOS, vigIni: '2026-11-01', vigFim: '2026-11-30' };
const f = (col: string[]): FiltrosGlobais => ({ ...NOV26, col });
const HOJE = '2026-11-09';

describe('Metas com atribuição', () => {
  it('base: a apólice atribuída sai da ANA e entra como renovação (R) da BIA, com o endosso', () => {
    const bia = buildMetasGroupData(filtrarMetas(L, f(['BIA']), HOJE), 0.1, 0.1);
    expect(bia).toHaveLength(1);
    expect(bia[0]).toMatchObject({ nome: 'BIA', np: 0, rp: 1050, rc: 105 });
    const ana = buildMetasGroupData(filtrarMetas(L, f(['ANA']), HOJE), 0.1, 0.1);
    expect(ana).toEqual([expect.objectContaining({ nome: 'ANA', np: 400, rp: 0 })]);
  });
  it('sem filtro de colaborador, a tabela agrupa pelo responsável e a meta de novos não conta a atribuída', () => {
    const todos = buildMetasGroupData(filtrarMetas(L, NOV26, HOJE), 0.1, 0.1);
    expect(Object.fromEntries(todos.map(r => [r.nome, [r.np, r.rp]]))).toEqual({ BIA: [0, 1050], ANA: [400, 0] });
    const cards = buildMetasEquipeCards(L, NOV26, HOJE, 0.4, 0.1);
    expect(cards.geral.metaProd).toBeCloseTo(400 * 1.4 + 1050 * 1.1);
  });
  it('botão de tipo R mostra a atribuída; botão N não', () => {
    expect(filtrarMetas(L, { ...f(['BIA']), tipos: ['R'] }, HOJE).map(r => r.apolice)).toEqual(['A1']);
    expect(filtrarMetas(L, { ...f(['BIA']), tipos: ['N'] }, HOJE)).toEqual([]);
  });
  it('realizado: a R emitida no nome do CAIO conta para a BIA', () => {
    expect(getMetasRealizadoData(L, f(['BIA'])).map(r => r.apolice)).toEqual(['R1']);
    expect(getMetasRealizadoData(L, f(['CAIO']))).toEqual([]);
  });
});

describe('Comparativo com atribuição', () => {
  it('com filtro BIA: a base do ano anterior tem a atribuída e o período atual tem a R ligada', () => {
    const d = dadosComp(L, f(['BIA']), { start: '2026-11-01', end: '2026-11-30' });
    expect(d.anterior.map(r => r.apolice).sort()).toEqual(['A1', 'A1']);
    expect(d.atual.map(r => r.apolice)).toEqual(['R1']);
    const dAna = dadosComp(L, f(['ANA']), { start: '2026-11-01', end: '2026-11-30' });
    expect(dAna.anterior.map(r => r.apolice)).toEqual(['A2']);
    expect(dAna.atual).toEqual([]);
  });
  it('safra da taxa de renovação (fim no período) segue o responsável', () => {
    const d = dadosComp(L, f(['BIA']), { start: '2026-11-01', end: '2026-11-30' });
    const k = dadosKpisComp(L, f(['BIA']), d);
    expect(k.safraAtual.map(r => r.apolice)).toEqual(['A1']);
  });
});

describe('"A renovar" com atribuição', () => {
  it('a BIA vê a apólice atribuída; a ANA não', () => {
    const bia = aRenovar(L, new Set(['BIA']), '2026-11', HOJE);
    const ana = aRenovar(L, new Set(['ANA']), '2026-11', HOJE);
    expect([...bia.vencidas, ...bia.aVencer].map(i => i.apolice)).toEqual([]);
    // A1 está Renovada (fora do "A renovar"); com Ativa ela aparece para a BIA.
    const L2 = aplicarAtribuicoes([{ ...a1, sit: 'Ativa' }, a2], [AT]).linhas;
    expect(aRenovar(L2, new Set(['BIA']), '2026-11', HOJE).aVencer.map(i => i.apolice)).toEqual(['A1']);
    expect(aRenovar(L2, new Set(['ANA']), '2026-11', HOJE).aVencer.map(i => i.apolice)).toEqual(['A2']);
    expect(ana.aVencer.map(i => i.apolice)).toEqual(['A2']);
  });
  it('mostra o responsável no lugar do colaborador da planilha', () => {
    const L2 = aplicarAtribuicoes([{ ...a1, sit: 'Ativa' }], [AT]).linhas;
    expect(aRenovar(L2, new Set(['BIA']), '2026-11', HOJE).aVencer[0].colab).toBe('BIA');
  });
});
