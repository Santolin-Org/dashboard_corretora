# Divergências e peculiaridades (decisão do Mitz)

## Task 3 — domínio base

- **`#rec-badge` mostra "0 registros" na carga inicial no app antigo.** `updateDashHeader`
  roda antes de `FD` ser preenchido (main.js:935/937). O app novo reproduz isso de propósito,
  para paridade. Decidir se vira correção depois da migração.
