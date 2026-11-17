# Configuração do Supabase

O GitHub Pages hospeda a interface; o Supabase guarda os participantes e os
códigos para que o sorteio funcione em dispositivos diferentes.

1. Crie um projeto no [Supabase](https://supabase.com/).
2. No **SQL Editor**, execute o conteúdo de `supabase-schema.sql`.
3. Em **Project Settings → API Keys**, copie a **Project URL** e a chave
   **publishable** (`sb_publishable_...`).
   Cole esses valores em `supabase-config.js`.
4. Publique os arquivos deste projeto no GitHub e ative o GitHub Pages para o
   repositório.
5. Abra a página publicada, adicione os participantes e faça o sorteio. Baixe
   ou distribua em particular a lista de códigos antes de fechar ou recarregar a
   página. Cada participante informa seu código na página publicada.

O sorteio e a consulta usam funções do banco. As tabelas não permitem leitura
direta pelo público, e cada código só pode revelar um resultado uma vez.

**Nunca coloque uma chave `secret` ou `service_role` no site ou no repositório.**
A chave `publishable` é feita para uso público; o acesso aos dados é controlado
pelas permissões do banco e pelas funções do schema.
