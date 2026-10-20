import type { Linha } from "./tipos";
import type { Sinistro } from "./sinistros/parse";

/** Coluna de texto repetitivo: valores distintos em `d`, índices em `i`. */
export type ColunaDic = { d: string[]; i: number[] };

export type LinhasColunares = {
  n: number;
  dic: Record<(typeof DIC_LINHAS)[number], ColunaDic>;
  txt: Record<(typeof TXT_LINHAS)[number], string[]>;
  num: Record<(typeof NUM_LINHAS)[number], number[]>;
  trocaSeg: number[]; // 0/1
  saudeManual: (0 | 1 | null)[]; // null = ausente
  saudeFaturaDe: (string | null)[]; // null = ausente
};

export type SinistrosColunares = {
  n: number;
  dic: Record<(typeof DIC_SIN)[number], ColunaDic>;
  txt: Record<(typeof TXT_SIN)[number], string[]>;
  num: Record<(typeof NUM_SIN)[number], number[]>;
};

const DIC_LINHAS = ["tipo", "vig", "em", "fim", "seg", "ramo", "grp", "colab", "sit", "motivo", "cancel", "tipoPessoa", "tipoDoc", "campanha"] as const;
const TXT_LINHAS = ["cli", "docDigits", "apolice", "endosso"] as const;
const NUM_LINHAS = ["premio", "com"] as const;
const DIC_SIN = ["abertura", "aviso", "encerra", "status", "seg", "ramo", "motivo", "tipoSin", "colab", "grp"] as const;
const TXT_SIN = ["id", "sinNum", "cli"] as const;
const NUM_SIN = ["valor", "pago", "impSeg", "franquia", "prejEst", "premioPago"] as const;

function dic<T, K extends string>(itens: T[], k: K): ColunaDic {
  const idx = new Map<string, number>();
  const d: string[] = [];
  const i = new Array<number>(itens.length);
  for (let j = 0; j < itens.length; j++) {
    const v = String((itens[j] as Record<string, unknown>)[k] ?? "");
    let p = idx.get(v);
    if (p === undefined) {
      p = d.length;
      idx.set(v, p);
      d.push(v);
    }
    i[j] = p;
  }
  return { d, i };
}
const col = <T, K extends string, V>(itens: T[], k: K): V[] => itens.map((x) => (x as Record<string, V>)[k]);
const fromDic = (c: ColunaDic, j: number) => c.d[c.i[j]];

export function codificarLinhas(l: Linha[]): LinhasColunares {
  const o = { n: l.length, dic: {} as Record<string, unknown>, txt: {} as Record<string, unknown>, num: {} as Record<string, unknown> };
  for (const k of DIC_LINHAS) o.dic[k] = dic(l, k);
  for (const k of TXT_LINHAS) o.txt[k] = col(l, k);
  for (const k of NUM_LINHAS) o.num[k] = col(l, k);
  return {
    ...(o as unknown as Pick<LinhasColunares, "n" | "dic" | "txt" | "num">),
    trocaSeg: l.map((x) => (x.trocaSeg ? 1 : 0)),
    saudeManual: l.map((x) => (x.saudeManual === undefined ? null : x.saudeManual ? 1 : 0)),
    saudeFaturaDe: l.map((x) => (x.saudeFaturaDe === undefined ? null : x.saudeFaturaDe)),
  };
}

export function decodificarLinhas(c: LinhasColunares): Linha[] {
  const out: Linha[] = new Array(c.n);
  for (let j = 0; j < c.n; j++) {
    const r: Record<string, unknown> = {};
    for (const k of DIC_LINHAS) r[k] = fromDic(c.dic[k], j);
    for (const k of TXT_LINHAS) r[k] = c.txt[k][j];
    for (const k of NUM_LINHAS) r[k] = c.num[k][j];
    r.trocaSeg = c.trocaSeg[j] === 1;
    if (c.saudeManual[j] !== null) r.saudeManual = c.saudeManual[j] === 1;
    if (c.saudeFaturaDe[j] !== null) r.saudeFaturaDe = c.saudeFaturaDe[j];
    out[j] = r as unknown as Linha;
  }
  return out;
}

export function codificarSinistros(s: Sinistro[]): SinistrosColunares {
  const o = { n: s.length, dic: {} as Record<string, unknown>, txt: {} as Record<string, unknown>, num: {} as Record<string, unknown> };
  for (const k of DIC_SIN) o.dic[k] = dic(s, k);
  for (const k of TXT_SIN) o.txt[k] = col(s, k);
  for (const k of NUM_SIN) o.num[k] = col(s, k);
  return o as unknown as SinistrosColunares;
}

export function decodificarSinistros(c: SinistrosColunares): Sinistro[] {
  const out: Sinistro[] = new Array(c.n);
  for (let j = 0; j < c.n; j++) {
    const r: Record<string, unknown> = {};
    for (const k of DIC_SIN) r[k] = fromDic(c.dic[k], j);
    for (const k of TXT_SIN) r[k] = c.txt[k][j];
    for (const k of NUM_SIN) r[k] = c.num[k][j];
    out[j] = r as unknown as Sinistro;
  }
  return out;
}
