// Fixture sintética e DETERMINÍSTICA (sem Math.random/Date.now) para o harness de
// paridade. Cabeçalhos idênticos a COL / COL_SIN / SAUDE_COL do main.js.
// Nenhum dado real: nomes, documentos e números são inventados.
import * as XLSX from "xlsx";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const COLUNAS_PRODUCAO = [
  "TIPO DE NEGÓCIO", "INÍCIO DE VIGÊNCIA", "DATA EMISSÃO", "TÉRMINO DE VIGÊNCIA", "CLIENTE",
  "SEGURADORA", "RAMO", "GRUPO DE PRODUÇÃO", "PRÊMIO", "COMISSÃO", "COLABORADOR", "SITUAÇÃO",
  "MOTIVO CANCELAMENTO", "DATA CANCELAMENTO", "CPF/CNPJ", "TIPO PESSOA", "TIPO DOCUMENTO",
  "CAMPANHA", "APÓLICE", "ENDOSSO",
];
const COLUNAS_SINISTROS = [
  "Nº AVISO", "Nº SINISTRO", "DATA SINISTRO", "DATA AVISO", "DATA LIQUIDADO", "SITUAÇÃO DO SINISTRO",
  "SEGURADORA", "RAMO", "SEGURADO", "APURADO", "INDENIZADO", "IMP. SEG.", "FRANQUIA",
  "PREJ. ESTIMADO", "PRÊMIO PAGO", "MOTIVO DO SINISTRO", "TIPO DE SINISTRO", "COLABORADOR",
  "GRUPO ECONÔMICO",
];
const COLUNAS_SAUDE = [
  "APÓLICE", "CLIENTE", "CPF/CNPJ", "SEGURADORA", "INÍCIO DE VIGÊNCIA", "DATA EMISSÃO",
  "TIPO DE NEGÓCIO", "COLABORADOR", "PARCELA", "QTD. PARCELAS", "% AGENCIAMENTO", "% COMISSÃO",
  "PRÊMIO LÍQUIDO", "AGENCIAMENTO R$", "COMISSÃO R$", "TOTAL RECEBIDO",
];

type Linha = Record<string, string | number | Date>;

function mulberry32(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIA = 86400000;
const utc = (ano: number, mes: number, dia: number) => Date.UTC(ano, mes - 1, dia, 12, 0, 0);
// Serial Excel inteiro (dia civil) para a data em ms UTC.
const serial = (ms: number) => Math.floor(ms / DIA) + 25569;

const COLABS = [
  "FERNANDO DE PAULA SERAFIM", "ANA CLARA MENDES", "BRUNO TAVARES", "CARLA NOGUEIRA", "DIOGO FARIAS",
];
const GRUPOS = ["Santolin 360", "Corretora", "Parcerias"];
const SEGS = ["Porto Seguro", "Bradesco Seguros", "Tokio Marine", "Allianz", "HDI Seguros", "Mapfre"];
const RAMOS = [
  "Automóvel - Casco", "Compreensivo Residencial", "Compreensivo Empresarial", "Vida", "Vida em Grupo",
  "Riscos Diversos", "Responsabilidade Civil Geral", "Seguro Viagem Individual", "Transporte Nacional",
  "Acidentes Pessoais",
];
const SITS = ["Ativa", "Renovada", "Vencida", "Cancelada", "Suspensa", "Perda total"];
const MOTIVOS = ["Falta de pagamento", "Preço", "Venda do bem", "Insatisfação com atendimento", "Troca de seguradora"];
const NOMES = [
  "Alfa", "Beta", "Gama", "Delta", "Ômega", "Sigma", "Zeta", "Kappa", "Lambda", "Épsilon", "Teta", "Iota",
];
const SOBRENOMES = ["Silva", "Souza", "Oliveira", "Lima", "Costa", "Ribeiro", "Almeida", "Carvalho", "Rocha", "Dias"];

type Cliente = { nome: string; doc: string; pessoa: "Física" | "Jurídica" };

function mascaraCpf(n: number) {
  const s = String(10000000000 + n).slice(-11);
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}
// CNPJ desta base vem com 15 dígitos (zero à esquerda), ex.: 032.259.341/0001-72.
function mascaraCnpj(n: number) {
  const s = String(100000000000000 + n * 7919).slice(-15);
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}/${s.slice(9, 13)}-${s.slice(13)}`;
}

function gerarClientes(rnd: () => number): Cliente[] {
  const out: Cliente[] = [];
  for (let i = 0; i < 70; i++) {
    const pj = i % 4 === 3;
    const nome = pj
      ? `${NOMES[i % NOMES.length]} ${SOBRENOMES[(i * 3) % SOBRENOMES.length]} Comércio Ltda ${i}`
      : `${NOMES[i % NOMES.length]} ${SOBRENOMES[(i * 7) % SOBRENOMES.length]} ${i}`;
    out.push({
      nome,
      doc: pj ? mascaraCnpj(i + 11) : mascaraCpf(30000000 + i * 977 + Math.floor(rnd() * 100)),
      pessoa: pj ? "Jurídica" : "Física",
    });
  }
  return out;
}

export function gerarFixture(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const rnd = mulberry32(20261015);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const clientes = gerarClientes(rnd);
  const HOJE = utc(2026, 10, 15);
  let seqApolice = 1000;
  let seqEndosso = 1;
  let alternaSerial = 0;

  // Datas: ora Date, ora número serial Excel.
  const data = (ms: number | null): Date | number | string => {
    if (ms === null) return "";
    alternaSerial++;
    return alternaSerial % 5 === 0 ? serial(ms) : new Date(ms);
  };

  function situacaoPara(fimMs: number): string {
    const r = rnd();
    if (fimMs > HOJE) return r < 0.04 ? "Suspensa" : "Ativa";
    if (r < 0.45) return "Renovada";
    if (r < 0.75) return "Vencida";
    if (r < 0.88) return "Cancelada";
    if (r < 0.94) return "Perda total";
    return "Suspensa";
  }

  function linhaBase(o: {
    tipo: string; vig: number; cli: Cliente; seg: string; ramo: string; premio: number; com: number;
    colab: string; sit: string; apolice: string; endosso?: string; tipoDoc?: string;
    cancel?: number | null; motivo?: string; grp?: string;
  }): Linha {
    const fim = o.vig + 365 * DIA;
    return {
      "TIPO DE NEGÓCIO": o.tipo,
      "INÍCIO DE VIGÊNCIA": data(o.vig) as Date | number,
      "DATA EMISSÃO": data(o.vig - 3 * DIA) as Date | number,
      "TÉRMINO DE VIGÊNCIA": data(fim) as Date | number,
      CLIENTE: o.cli.nome,
      SEGURADORA: o.seg,
      RAMO: o.ramo,
      "GRUPO DE PRODUÇÃO": o.grp ?? GRUPOS[Math.floor(rnd() * GRUPOS.length)],
      PRÊMIO: o.premio,
      COMISSÃO: o.com,
      COLABORADOR: o.colab,
      SITUAÇÃO: o.sit,
      "MOTIVO CANCELAMENTO": o.motivo ?? "",
      "DATA CANCELAMENTO": data(o.cancel ?? null) as Date | number,
      "CPF/CNPJ": o.cli.doc,
      "TIPO PESSOA": o.cli.pessoa,
      "TIPO DOCUMENTO": o.tipoDoc ?? "APÓLICE",
      CAMPANHA: rnd() < 0.1 ? "Campanha Verão" : "",
      APÓLICE: o.apolice,
      ENDOSSO: o.endosso ?? "",
    };
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const arq2024: Linha[] = [];
  const arq2026: Linha[] = [];

  // ── Apólices-mãe (N/R) + endossos, distribuídas entre 2024 e 2026 ─────────────
  const alvo2024 = 150, alvo2026 = 150;
  for (let i = 0; i < alvo2024 + alvo2026; i++) {
    const no2024 = i < alvo2024;
    // 2024 → vigências em 2024; 2026 → 2025–2026.
    const vig = no2024
      ? utc(2024, 1, 8) + Math.floor(rnd() * (utc(2024, 12, 20) - utc(2024, 1, 8)) / DIA) * DIA
      : utc(2025, 1, 6) + Math.floor(rnd() * (utc(2026, 10, 10) - utc(2025, 1, 6)) / DIA) * DIA;
    const cli = clientes[(i * 13) % clientes.length];
    let ramo = RAMOS[i % RAMOS.length];
    if (i % 17 === 0) ramo = "Saúde";
    const seg = pick(SEGS);
    const colab = COLABS[(i * 3) % COLABS.length];
    const tipo = rnd() < 0.55 ? "N" : "R";
    const premio = r2(800 + rnd() * 9000);
    const com = r2(premio * (0.08 + rnd() * 0.12));
    const apolice = `AP-${seqApolice++}`;
    const fim = vig + 365 * DIA;
    const sit = situacaoPara(fim);
    let cancel: number | null = null, motivo = "";
    if (sit === "Cancelada") {
      cancel = vig + Math.floor((60 + rnd() * 200)) * DIA;
      if (cancel > HOJE) cancel = HOJE - 5 * DIA;
      motivo = pick(MOTIVOS);
    }
    const saude = ramo === "Saúde";
    const linha = linhaBase({
      tipo, vig, cli, seg, ramo, premio: saude ? 0 : premio, com: saude ? 0 : com, colab, sit, apolice,
      cancel, motivo,
    });
    (no2024 ? arq2024 : arq2026).push(linha);
    if (cancel !== null) {
      // Endosso de cancelamento da própria apólice (CN para N, CR para R).
      (no2024 ? arq2024 : arq2026).push(linhaBase({
        tipo: tipo === "N" ? "CN" : "CR", vig: cancel, cli, seg, ramo, premio: -r2(premio * 0.4),
        com: -r2(com * 0.4), colab, sit, apolice, endosso: String(seqEndosso++), tipoDoc: "ENDOSSO",
        cancel, motivo,
      }));
    }
    // Endossos (mesmo número de APÓLICE da mãe) em parte das apólices.
    if (!saude && i % 3 === 0) {
      const tEnd = tipo === "N" ? "EN" : "ER";
      (no2024 ? arq2024 : arq2026).push(linhaBase({
        tipo: tEnd, vig: vig + 40 * DIA, cli, seg, ramo, premio: r2(premio * 0.1), com: r2(com * 0.1),
        colab, sit, apolice, endosso: String(seqEndosso++), tipoDoc: "ENDOSSO",
      }));
    }
  }

  // ── Casos dirigidos ───────────────────────────────────────────────────────────
  // Troca de seguradora: cancelada na cia A e reemitida na cia B em até 15 dias.
  const cliTroca = clientes[5];
  const vigA = utc(2026, 1, 10), cancA = utc(2026, 6, 20);
  arq2026.push(linhaBase({
    tipo: "N", vig: vigA, cli: cliTroca, seg: "Porto Seguro", ramo: "Automóvel - Casco", premio: 3200,
    com: 480, colab: COLABS[1], sit: "Cancelada", apolice: "AP-TROCA-1", cancel: cancA,
    motivo: "Troca de seguradora", grp: "Corretora",
  }));
  arq2026.push(linhaBase({
    tipo: "CN", vig: cancA, cli: cliTroca, seg: "Porto Seguro", ramo: "Automóvel - Casco", premio: -1500,
    com: -225, colab: COLABS[1], sit: "Cancelada", apolice: "AP-TROCA-1", endosso: String(seqEndosso++),
    tipoDoc: "ENDOSSO", cancel: cancA, motivo: "Troca de seguradora", grp: "Corretora",
  }));
  arq2026.push(linhaBase({
    tipo: "R", vig: cancA - 8 * DIA, cli: cliTroca, seg: "Tokio Marine", ramo: "Automóvel - Casco",
    premio: 3350, com: 500, colab: COLABS[1], sit: "Ativa", apolice: "AP-TROCA-2", grp: "Corretora",
  }));

  // Linha de 2021 perdida dentro do producao_2026.xlsx.
  arq2026.push(linhaBase({
    tipo: "R", vig: utc(2021, 5, 17), cli: clientes[9], seg: "Allianz", ramo: "Vida", premio: 1100,
    com: 200, colab: COLABS[2], sit: "Vencida", apolice: "AP-2021-1", grp: "Santolin 360",
  }));

  // Linha duplicada idêntica entre os dois arquivos (a do 2024 reaparece no 2026).
  arq2026.push({ ...arq2024[3] });
  arq2026.push({ ...arq2024[10] });

  // Saúde: apólice com prêmio zero + linha correspondente no saude_fernando.xlsx.
  const cliSaude = clientes[20];
  const vigSaude = utc(2026, 2, 1);
  arq2026.push(linhaBase({
    tipo: "N", vig: vigSaude, cli: cliSaude, seg: "Bradesco Seguros", ramo: "Saúde", premio: 0, com: 0,
    colab: COLABS[0], sit: "Ativa", apolice: "SAU-0001", grp: "Santolin 360",
  }));
  // Faturas mensais pagas entram como endosso EN com o valor do mês.
  for (let m = 0; m < 3; m++) {
    arq2026.push(linhaBase({
      tipo: "EN", vig: utc(2026, 2 + m, 1), cli: cliSaude, seg: "Bradesco Seguros", ramo: "Saúde",
      premio: 950, com: 110, colab: COLABS[0], sit: "Ativa", apolice: "SAU-0001",
      endosso: String(seqEndosso++), tipoDoc: "ENDOSSO", grp: "Santolin 360",
    }));
  }
  // Segundo saúde sem número de apólice (casa por CPF/CNPJ + vigência).
  const cliSaude2 = clientes[23];
  arq2026.push(linhaBase({
    tipo: "N", vig: utc(2026, 5, 4), cli: cliSaude2, seg: "Allianz", ramo: "Saúde", premio: 0, com: 0,
    colab: COLABS[0], sit: "Ativa", apolice: "", grp: "Santolin 360",
  }));
  // Apólice vazia para forçar tipoPessoa pelo documento: PESSOA em branco.
  const cliSemPessoa = { ...clientes[27], pessoa: "" as unknown as "Física" };
  arq2026.push(linhaBase({
    tipo: "N", vig: utc(2026, 6, 12), cli: cliSemPessoa, seg: "HDI Seguros", ramo: "Riscos Diversos",
    premio: 2100, com: 300, colab: COLABS[3], sit: "Ativa", apolice: "AP-SEMPESSOA", grp: "Parcerias",
  }));
  // Garante todos os seis valores de SITUAÇÃO (incluindo 'Perda total' em minúsculas).
  SITS.forEach((s, k) => {
    arq2026.push(linhaBase({
      tipo: "R", vig: utc(2025, 4, 1 + k), cli: clientes[40 + k], seg: SEGS[k], ramo: RAMOS[k], premio: 1500 + k * 100,
      com: 150 + k * 10, colab: COLABS[k % COLABS.length], sit: s, apolice: `AP-SIT-${k}`,
      cancel: s === "Cancelada" ? utc(2025, 8, 1) : null, motivo: s === "Cancelada" ? "Preço" : "",
    }));
  });
  // Mais volume até ~400 linhas no total, com tipos variados.
  const extras = 400 - (arq2024.length + arq2026.length);
  for (let i = 0; i < extras; i++) {
    const vig = utc(2025, 1, 5) + Math.floor(rnd() * 600) * DIA;
    const cli = clientes[(i * 11 + 3) % clientes.length];
    const premio = r2(500 + rnd() * 6000);
    arq2026.push(linhaBase({
      tipo: i % 2 === 0 ? "N" : "R", vig: Math.min(vig, utc(2026, 10, 12)), cli, seg: pick(SEGS),
      ramo: pick(RAMOS), premio, com: r2(premio * 0.12), colab: pick(COLABS),
      sit: situacaoPara(vig + 365 * DIA), apolice: `AP-X${i}`,
    }));
  }

  gravar(join(dir, "producao_2024.xlsx"), COLUNAS_PRODUCAO, arq2024);
  gravar(join(dir, "producao_2026.xlsx"), COLUNAS_PRODUCAO, arq2026);

  // ── Sinistros ────────────────────────────────────────────────────────────────
  const avisados: Linha[] = [];
  const pagamentos: Linha[] = [];
  const statusSin = ["Em análise", "Pago", "Negado", "Liquidado"];
  const motivosSin = ["Colisão", "Roubo", "Incêndio", "Danos elétricos", "Furto"];
  for (let i = 0; i < 40; i++) {
    const abertura = utc(2025, 1, 10) + Math.floor(rnd() * 600) * DIA;
    const cli = clientes[(i * 5) % clientes.length];
    const apurado = r2(1000 + rnd() * 20000);
    const pago = i % 3 === 0 ? 0 : r2(apurado * (0.6 + rnd() * 0.4));
    avisados.push({
      "Nº AVISO": `AV-${5000 + i}`, "Nº SINISTRO": `SN-${7000 + i}`, "DATA SINISTRO": data(abertura) as Date | number,
      "DATA AVISO": data(abertura + 2 * DIA) as Date | number, "DATA LIQUIDADO": pago ? (data(abertura + 40 * DIA) as Date | number) : "",
      "SITUAÇÃO DO SINISTRO": statusSin[i % statusSin.length], SEGURADORA: SEGS[i % SEGS.length],
      RAMO: RAMOS[i % 3], SEGURADO: cli.nome, APURADO: apurado, INDENIZADO: pago, "IMP. SEG.": r2(apurado * 0.2),
      FRANQUIA: r2(apurado * 0.05), "PREJ. ESTIMADO": r2(apurado * 1.1), "PRÊMIO PAGO": r2(2000 + rnd() * 5000),
      "MOTIVO DO SINISTRO": motivosSin[i % motivosSin.length], "TIPO DE SINISTRO": i % 2 ? "Parcial" : "Total",
      COLABORADOR: COLABS[i % COLABS.length], "GRUPO ECONÔMICO": GRUPOS[i % GRUPOS.length],
    });
  }
  // Pagamentos: metade repete avisos (mesmo Nº AVISO), metade é nova.
  for (let i = 0; i < 25; i++) {
    const base = i < 12 ? avisados[i * 2] : null;
    if (base) {
      pagamentos.push({ ...base, INDENIZADO: r2(Number(base.APURADO) * 0.8), "SITUAÇÃO DO SINISTRO": "Pago" });
    } else {
      const abertura = utc(2025, 6, 1) + i * 9 * DIA;
      const cli = clientes[(i * 9) % clientes.length];
      const apurado = r2(2000 + rnd() * 15000);
      pagamentos.push({
        "Nº AVISO": `AV-${6000 + i}`, "Nº SINISTRO": `SN-${8000 + i}`, "DATA SINISTRO": data(abertura) as Date | number,
        "DATA AVISO": data(abertura + 3 * DIA) as Date | number, "DATA LIQUIDADO": data(abertura + 50 * DIA) as Date | number,
        "SITUAÇÃO DO SINISTRO": "Pago", SEGURADORA: SEGS[i % SEGS.length], RAMO: RAMOS[i % 3], SEGURADO: cli.nome,
        APURADO: apurado, INDENIZADO: r2(apurado * 0.9), "IMP. SEG.": r2(apurado * 0.2), FRANQUIA: r2(apurado * 0.05),
        "PREJ. ESTIMADO": r2(apurado * 1.1), "PRÊMIO PAGO": r2(2500 + rnd() * 4000),
        "MOTIVO DO SINISTRO": motivosSin[i % motivosSin.length], "TIPO DE SINISTRO": "Parcial",
        COLABORADOR: COLABS[i % COLABS.length], "GRUPO ECONÔMICO": GRUPOS[i % GRUPOS.length],
      });
    }
  }
  gravar(join(dir, "sinistrosAvisados.xlsx"), COLUNAS_SINISTROS, avisados);
  gravar(join(dir, "sinistrosPagamentos.xlsx"), COLUNAS_SINISTROS, pagamentos);

  // ── Saúde (lançamentos à parte) ───────────────────────────────────────────────
  const saude: Linha[] = [
    {
      APÓLICE: "SAU-0001", CLIENTE: cliSaude.nome, "CPF/CNPJ": cliSaude.doc, SEGURADORA: "Bradesco Seguros",
      "INÍCIO DE VIGÊNCIA": new Date(vigSaude), "DATA EMISSÃO": new Date(vigSaude - 2 * DIA), "TIPO DE NEGÓCIO": "N",
      COLABORADOR: COLABS[0], PARCELA: 1000, "QTD. PARCELAS": 12, "% AGENCIAMENTO": 0.1, "% COMISSÃO": 0.02,
      "PRÊMIO LÍQUIDO": 12000, "AGENCIAMENTO R$": 360, "COMISSÃO R$": 240, "TOTAL RECEBIDO": 600,
    },
    {
      APÓLICE: "", CLIENTE: cliSaude2.nome, "CPF/CNPJ": cliSaude2.doc, SEGURADORA: "Allianz",
      "INÍCIO DE VIGÊNCIA": serial(utc(2026, 5, 4)), "DATA EMISSÃO": "", "TIPO DE NEGÓCIO": "N",
      COLABORADOR: COLABS[0], PARCELA: 800, "QTD. PARCELAS": 12, "% AGENCIAMENTO": 0.1, "% COMISSÃO": 0.02,
      "PRÊMIO LÍQUIDO": 9600, "AGENCIAMENTO R$": 288, "COMISSÃO R$": 192, "TOTAL RECEBIDO": "",
    },
  ];
  gravar(join(dir, "saude_fernando.xlsx"), COLUNAS_SAUDE, saude);
}

function gravar(caminho: string, colunas: string[], linhas: Linha[]) {
  const ws = XLSX.utils.json_to_sheet(linhas, { header: colunas, cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planilha1");
  XLSX.writeFile(wb, caminho, { cellDates: true });
}
