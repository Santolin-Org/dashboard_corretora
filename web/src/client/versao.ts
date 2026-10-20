// Identidade numérica estável de um objeto, para compor a `chave` do <Grafico>: o objeto de dados
// (resultado de um useMemo) muda quando os dados ou controles mudam, e o id muda junto.
const ids = new WeakMap<object, number>();
let seq = 0;
export function idObjeto(o: object): number {
  let v = ids.get(o);
  if (v === undefined) { v = ++seq; ids.set(o, v); }
  return v;
}
