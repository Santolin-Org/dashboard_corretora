// Foto de cada colaborador para o pódio da Exibição TV.
// PENDENTE: virá do cadastro do usuário (vínculo login → colaborador, Etapa 3). Até lá não há
// foto cadastrada e o pódio mostra o placeholder com as iniciais. Para testar uma foto antes do
// cadastro, acrescente aqui `"NOME COMPLETO COMO NA PLANILHA": "/caminho/da/foto.jpg"`.
const FOTOS: Record<string, string> = {};

export function fotoDoColaborador(colab: string): string | null {
  return FOTOS[colab] ?? null;
}
