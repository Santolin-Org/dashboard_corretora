# Divergências e peculiaridades (decisão do Mitz)

## Task 3 — domínio base

- **`#rec-badge` mostra "0 registros" na carga inicial no app antigo.** `updateDashHeader`
  roda antes de `FD` ser preenchido (main.js:935/937). O app novo reproduz isso de propósito,
  para paridade. Decidir se vira correção depois da migração.
- **Parse de datas sem `cellDates`.** O antigo lê com `cellDates:true` (o SheetJS monta `Date`
  no fuso do processo). O novo lê serial numérico e converte pela data civil UTC do serial,
  igual ao que o `fmtD` do navegador em São Paulo produz para células à meia-noite ou ao
  meio-dia. Uma célula com hora tardia (após 21h) daria, no antigo em São Paulo, o dia seguinte
  (o `toISOString` é UTC); o novo mantém o dia da célula. A fixture não cobre esse caso; validar
  com os dados reais na Task 23.
