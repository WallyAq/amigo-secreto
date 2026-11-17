# Configuração do Supabase

O GitHub Pages hospeda a interface; o Supabase guarda os participantes e os
códigos para que o sorteio funcione em dispositivos diferentes.

1. Crie um projeto no [Supabase](https://supabase.com/).
2. No **SQL Editor**, execute todo o conteúdo atualizado de
   `supabase-schema.sql`. Se já executou uma versão anterior, execute o arquivo
   completo novamente para criar as funções da lista compartilhada.
3. Em **Project Settings → API Keys**, copie a **Project URL** e a chave
   **publishable** (`sb_publishable_...`).
   Cole esses valores em `supabase-config.js`.
4. Publique os arquivos deste projeto no GitHub e ative o GitHub Pages para o
   repositório.
5. Abra a página publicada. Os nomes adicionados ou removidos são salvos no
   Supabase e aparecem para os outros visitantes. Quando houver pelo menos duas
   pessoas, qualquer visitante pode iniciar o sorteio. O embaralhamento usa
   Fisher–Yates com bytes aleatórios criptográficos. Baixe e distribua em
   particular a lista de códigos assim que o sorteio terminar; ela não pode ser
   recuperada depois de fechar ou recarregar a página.

Este projeto configura uma única lista compartilhada, com limite de 100 nomes.
Qualquer visitante pode ver, adicionar ou remover nomes e iniciar o sorteio.
Qualquer visitante também pode zerar a lista e o sorteio atual; isso apaga os
códigos antigos e permite começar novamente. Não há login de organizador. O
sorteio, o reset e a consulta usam funções do banco; as tabelas não permitem
leitura direta, e cada código só pode revelar um resultado uma vez.

**Nunca coloque uma chave `secret` ou `service_role` no site ou no repositório.**
A chave `publishable` é feita para uso público; o acesso aos dados é controlado
pelas permissões do banco e pelas funções do schema.
