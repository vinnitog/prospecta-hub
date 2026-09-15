---
name: qa-automate
description: Criar ou ajustar testes executáveis do Prospecta Hub com node:test, SQLite temporário e transporte Meta simulado.
---

# Automação de QA do Prospecta

Use `node:test` e `node:assert/strict`, mantendo testes em `unit/`. A API permite Store e fetch injetados; use esses pontos sem depender de token, número real, rede externa ou projeto vizinho.

Verifique resultados observáveis: mensagem persistida, número de chamadas ao transporte, status HTTP, ausência de escrita cruzada e estado após reinício. Para rotas HTTP, subir servidor em porta efêmera loopback e encerrar em `t.after`. Bancos temporários devem ser criados em pasta própria do teste e removidos ao final, nunca apontando para dados do usuário.

Execute `test.cmd` e `npm.cmd run check`. Não escrever testes que apenas confirmem textos de instrução ou espelhem cada linha da implementação. Diferencie testes unitários/HTTP e validação visual ou real da Meta no relatório.
