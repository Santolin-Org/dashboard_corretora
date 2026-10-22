import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { montarBase } from '../../src/domain/producao/base';
import { parseSaude } from '../../src/domain/saude/parse';
import type { Linha } from '../../src/domain/tipos';
import {
  CROSS_PAGE_SIZE, ORDEM_CROSS_INICIAL, alternarOrdemCross, buildCrossMap, campanha360, contarNiveis, exportacaoCross, filtrosCrossIniciais,
  formatDoc, getCampanha360Rows, getCrossClients, getCrossRamoList, graficoNivel, kpisCross, metaFases, opcoesColabCross, penetracaoCross,
  ramosPadraoCross, tabelaCross, type FiltrosCross, type ModoPen, type OrdemCross,
} from '../../src/domain/crosssell';
import { fBRL, fN } from '../../src/domain/formatos';
import { carregarFixture } from './fixture';
import { linha } from './helpers';

const HOJE = '2026-10-15';
// Date.now() do harness de paridade (relógio fixo, 12:00 em São Paulo).
const AGORA = Date.parse('2026-10-15T12:00:00-03:00');
let ALL: Linha[];
beforeAll(() => {
  const fx = carregarFixture();
  ALL = montarBase(fx.fontes, parseSaude(fx.saude!), HOJE).linhas;
});

type Golden = { textos: Record<string, string>; graficos: Record<string, { labels: string[]; datasets: { data: number[] }[] }> };
const dourado = (c: string): Golden => JSON.parse(readFileSync(join(__dirname, '../../parity/golden-fixture', `${c}.json`), 'utf8'));
const colapsar = (s: string) => s.replace(/\s+/g, ' ').trim();

type Caso = { f?: Partial<FiltrosCross>; modo?: ModoPen; ordem?: OrdemCross; pagina?: number };
const CASOS: Record<string, Caso> = {
  'crosssell-padrao': {},
  'crosssell-vigencia': {}, // filtros globais não valem na aba (usa ALL)
  'crosssell-colab': {},
  'crosssell-tipos': {},
  'crosssell-ramo-seg': {},
  'crosssell-pj': { f: { pessoa: 'PJ' } },
  'crosssell-oportunidade': { modo: 'oportunidade' },
  'crosssell-pagina2': { pagina: 2 },
  'crosssell-busca': { f: { busca: 'Silva' } },
  'crosssell-ordenacao-ltv-asc': { ordem: { chave: 'ltv', dir: 'asc' } },
};
const filtrosDe = (c: Caso): FiltrosCross => {
  const f = { ...filtrosCrossIniciais(ALL), ...c.f };
  // setCrossPessoa: limpa ramo/colaborador e remarca os ramos principais da pessoa.
  if (c.f?.pessoa) f.ram = ramosPadraoCross(ALL, f.pessoa);
  return f;
};

const textoKpis = (k: ReturnType<typeof kpisCross>) => colapsar(k.map(c => c.l + c.v + c.s).join(''));
const textoPen = (p: ReturnType<typeof penetracaoCross>) => p.vazio ? 'Nenhum dado para o filtro atual.' : colapsar(p.linhas.map(l => l.modo === 'oportunidade' ? `${l.ramo} ${l.txt}` : `${l.ramo} ${l.txtYes} ${l.txtNo}`).join(' '));
const textoTabela = (t: ReturnType<typeof tabelaCross>, ramos: string[]) => colapsar(
  'Nome CPF/CNPJ ' + ramos.join('') + ' Apólices ativas LTV ' +
  (t.linhas.length ? t.linhas.map(l => [l.nome, l.doc, l.ramos.map(x => (x ? '✅' : '—')).join(''), l.apolicesAtivas, l.ltv].join(' ')).join(' ') : 'Nenhum cliente encontrado'));
const textoPag = (t: ReturnType<typeof tabelaCross>) => t.total === 0 ? '' : `${fN(t.inicio + 1)}–${fN(t.inicio + t.naPagina)} de ${fN(t.total)} ← Anterior Página ${t.pagina} de ${t.totalPaginas} Próxima →`;
const textoCampanha = (c: ReturnType<typeof campanha360>) => colapsar(
  c.metas.map(m => `${m.label} ${m.valor} / ${m.metaFinal} ${m.marcadores.map(k => `Fase ${k.fase}${k.valor}`).join('')} ${m.badge}`).join(' ') + ' ' +
  c.podios.map(p => `${p.titulo} ${p.nomes[1]} 2 ${p.nomes[0]} 1 ${p.nomes[2]} 3`).join(' '));

describe('Cross-sell contra os dourados da fixture', () => {
  it.each(Object.keys(CASOS))('%s: campanha, KPIs, penetração, nível e tabela paginada', (nome) => {
    const c = CASOS[nome], g = dourado(nome).textos, gr = dourado(nome).graficos;
    const f = filtrosDe(c);
    // onCrossSearch só redesenha a tabela: KPIs, penetração e nível continuam com a lista de antes da busca (renderCrossTab).
    const clients = getCrossClients(ALL, { ...f, busca: '' }, AGORA);
    const clientsTabela = getCrossClients(ALL, f, AGORA);
    const ramos = getCrossRamoList(ALL, f);
    expect(textoCampanha(campanha360(ALL))).toBe(g['cross-campanha-wrap']);
    expect(textoKpis(kpisCross(ALL, clients, ramos))).toBe(g['cross-kpi-grid']);
    const pen = penetracaoCross(ALL, clients, ramos, c.modo ?? 'penetracao');
    expect(pen.titulo).toBe(g['cross-pen-title']);
    expect(textoPen(pen)).toBe(g['cross-pen-wrap']);
    const niv = graficoNivel(clients);
    expect(niv.badge).toBe(g['cross-nivel-badge']);
    expect(niv.counts).toEqual(gr['ch-cross-nivel'].datasets[0].data);
    expect(niv.labels).toEqual(gr['ch-cross-nivel'].labels);
    const t = tabelaCross(clientsTabela, ramos, c.ordem ?? ORDEM_CROSS_INICIAL, c.pagina ?? 1);
    expect(t.badge).toBe(g['cross-table-badge']);
    expect(textoTabela(t, ramos)).toBe(g['cross-table-wrap']);
    expect(textoPag(t)).toBe(g['cross-table-pagination']);
  });

  it('a fixture alcança a página 2 e a campanha tem valores', () => {
    expect(tabelaCross(getCrossClients(ALL, filtrosCrossIniciais(ALL), AGORA), [], ORDEM_CROSS_INICIAL, 2).totalPaginas).toBe(2);
    expect(getCampanha360Rows(ALL).length).toBeGreaterThan(0);
  });
});

describe('Cross-sell: regras (unidade)', () => {
  const F: FiltrosCross = { pessoa: 'PF', ram: [], col: [], busca: '' };
  it('LTV só existe com mais de 1 ano de histórico; anos = (agora - 1ª vigência) / 365,25 dias', () => {
    const rs = [
      linha({ docDigits: '1', cli: 'Velho', vig: '2020-01-01', vigMs: Date.parse('2020-01-01T03:00:00Z'), com: 1000 }),
      linha({ docDigits: '2', cli: 'Novo', vig: '2026-06-01', vigMs: Date.parse('2026-06-01T03:00:00Z'), com: 500 }),
    ];
    const [v, n] = getCrossClients(rs, F, AGORA);
    expect(v.anos).toBeCloseTo((AGORA - Date.parse('2020-01-01T03:00:00Z')) / (365.25 * 86400000), 10);
    expect(v.ltv).toBeCloseTo(1000 / v.anos, 10);
    expect(n.ltv).toBeNull();
  });
  it('sem vigMs, a 1ª vigência vem da data ISO à meia-noite de São Paulo; a menor vigência vence', () => {
    const rs = [linha({ docDigits: '1', vig: '2024-05-02' }), linha({ docDigits: '1', vig: '2023-05-02', vigMs: Date.parse('2023-05-02T03:00:00Z') }), linha({ docDigits: '1', vig: '' })];
    expect(buildCrossMap(rs, 'PF').get('1')!.primeiraVig).toBe(Date.parse('2023-05-02T03:00:00Z'));
    expect(buildCrossMap([rs[0]], 'PF').get('1')!.primeiraVig).toBe(Date.parse('2024-05-02T03:00:00Z'));
  });
  it('apólices ativas só contam tipoDoc APÓLICE; ramos ativos contam endosso; fatura de saúde fica fora da comissão (LTV)', () => {
    const rs = [
      linha({ docDigits: '1', sit: 'Ativa', tipoDoc: 'APÓLICE', ramo: 'Vida', com: 10 }),
      linha({ docDigits: '1', sit: 'Ativa', tipoDoc: 'ENDOSSO', ramo: 'Residencial', com: 5 }),
      linha({ docDigits: '1', sit: 'Vencida', tipoDoc: 'APÓLICE', ramo: 'Auto', com: 100 }),
      linha({ docDigits: '1', sit: 'Ativa', tipoDoc: 'ENDOSSO', ramo: 'Saúde', com: 7, saudeFaturaDe: 'N' }),
    ];
    const c = buildCrossMap(rs, 'PF').get('1')!;
    expect(c.apolicesAtivas).toBe(1);
    expect([...c.ramosAtivos]).toEqual(['Vida', 'Residencial', 'Saúde']);
    expect(c.comissaoTotal).toBe(115);
  });
  it('busca por nome (minúsculas, trim) ou por dígitos do documento; colaborador filtra por quem tocou o cliente', () => {
    const rs = [
      linha({ docDigits: '11122233344', cli: 'Maria Souza', colab: 'A' }),
      linha({ docDigits: '55566677788', cli: 'João Lima', colab: 'B' }),
    ];
    expect(getCrossClients(rs, { ...F, busca: '  maria ' }, AGORA).map(c => c.nome)).toEqual(['Maria Souza']);
    expect(getCrossClients(rs, { ...F, busca: '555.666' }, AGORA).map(c => c.nome)).toEqual(['João Lima']);
    expect(getCrossClients(rs, { ...F, col: ['B'] }, AGORA).map(c => c.nome)).toEqual(['João Lima']);
  });
  it('níveis: 1, 2, 3 e 4+ apólices ativas; 0 fica de fora', () => {
    expect(contarNiveis([{ apolicesAtivas: 0 }, { apolicesAtivas: 1 }, { apolicesAtivas: 2 }, { apolicesAtivas: 4 }, { apolicesAtivas: 9 }])).toEqual([1, 1, 0, 2]);
  });
  it('ramo padrão: principais por pessoa; ramo marcado fora do universo é ignorado na lista', () => {
    const rs = [linha({ docDigits: '1', ramo: 'Automóvel - Casco' }), linha({ docDigits: '1', ramo: 'Vida em Grupo' })];
    expect(ramosPadraoCross(rs, 'PF')).toEqual(['Automóvel - Casco']);
    expect(getCrossRamoList(rs, { ...F, ram: ['Vida em Grupo', 'Inexistente'] })).toEqual(['Vida em Grupo']);
    expect(getCrossRamoList(rs, F)).toEqual(['Automóvel - Casco', 'Vida em Grupo']);
    expect(opcoesColabCross([linha({ docDigits: '1', colab: 'Z' }), linha({ docDigits: '', colab: 'Y' })], 'PF')).toEqual(['Z']);
  });
  it('ordenação: nome começa asc, as demais desc; mesma chave inverte; LTV nulo vai ao fim em desc', () => {
    expect(alternarOrdemCross(ORDEM_CROSS_INICIAL, 'ltv')).toEqual({ chave: 'ltv', dir: 'asc' });
    expect(alternarOrdemCross(ORDEM_CROSS_INICIAL, 'nome')).toEqual({ chave: 'nome', dir: 'asc' });
    expect(alternarOrdemCross(ORDEM_CROSS_INICIAL, 'apolicesAtivas')).toEqual({ chave: 'apolicesAtivas', dir: 'desc' });
  });
  it('paginação: 50 por página, página limitada ao intervalo', () => {
    const rs = Array.from({ length: 120 }, (_, i) => linha({ docDigits: String(1000 + i), cli: `C${i}` }));
    const cl = getCrossClients(rs, F, AGORA);
    expect(CROSS_PAGE_SIZE).toBe(50);
    const t3 = tabelaCross(cl, [], { chave: 'nome', dir: 'asc' }, 3);
    expect([t3.pagina, t3.totalPaginas, t3.inicio, t3.naPagina]).toEqual([3, 3, 100, 20]);
    expect(tabelaCross(cl, [], ORDEM_CROSS_INICIAL, 99).pagina).toBe(3);
    expect(tabelaCross(cl, [], ORDEM_CROSS_INICIAL, 0).pagina).toBe(1);
  });
  it('campanha: só apólice com CAMPANHA normalizada e vigência no trimestre; ranking por colaborador (Sem identificação)', () => {
    const base = { tipoDoc: 'APÓLICE', vig: '2026-08-10' };
    const rs = [
      linha({ ...base, campanha: 'Santolin 360', colab: 'A', com: 10 }),
      linha({ ...base, campanha: 'SANTOLIN 360', colab: 'A', com: 20 }),
      linha({ ...base, campanha: 'SANTOLIN 360', colab: '', com: 500 }),
      linha({ ...base, campanha: 'SANTOLIN 360', tipoDoc: 'ENDOSSO', colab: 'A' }),
      linha({ ...base, campanha: 'SANTOLIN 360', vig: '2026-10-01', colab: 'A' }),
      linha({ ...base, campanha: 'Campanha Verão', colab: 'A' }),
    ];
    const c = campanha360(rs);
    expect(c.metas[0].valor).toBe('3');
    expect(c.metas[1].valor).toBe(fBRL(530));
    expect(c.podios[0].nomes).toEqual(['A', 'Sem identificação', '—']);
    expect(c.podios[1].nomes).toEqual(['Sem identificação', 'A', '—']);
  });
  it('metaFases: fases atingidas, posição dos marcadores e largura limitada a 100%', () => {
    const m = metaFases('X', 150, [120, 150, 180], fN);
    expect(m.badge).toBe('Fase 2 de 3 concluída');
    expect(m.larguraPct).toBe('83.33');
    expect(m.marcadores.map(k => k.atingida)).toEqual([true, true, false]);
    expect(metaFases('X', 999, [1, 2], fN).larguraPct).toBe('100.00');
    expect(metaFases('X', 0, [1, 2], fN).badge).toBe('Nenhuma fase concluída ainda');
  });
  it('formatDoc: PF com 11 dígitos, PJ com 14; qualquer outro tamanho vai cru; vazio vira —', () => {
    expect(formatDoc('12345678901', 'PF')).toBe('123.456.789-01');
    expect(formatDoc('12345678000190', 'PJ')).toBe('12.345.678/0001-90');
    expect(formatDoc('123456789012345', 'PJ')).toBe('123456789012345');
    expect(formatDoc('', 'PF')).toBe('—');
  });
  it('exportação: Nome, CPF/CNPJ, um Sim/Não por ramo, Apólices ativas e LTV (vazio sem LTV)', () => {
    const rs = [linha({ docDigits: '11122233344', cli: 'Maria', ramo: 'Vida', sit: 'Ativa', vig: '2026-09-01' })];
    const cl = getCrossClients(rs, F, AGORA);
    expect(exportacaoCross(cl, ['Vida', 'Auto'])).toEqual([{ Nome: 'Maria', 'CPF/CNPJ': '111.222.333-44', Vida: 'Sim', Auto: 'Não', 'Apólices ativas': 1, LTV: '' }]);
  });
});
