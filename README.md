# FlowBoard

Uma primeira versao de uma webapp privada para equipas pequenas gerirem projetos com:

- projetos separados;
- task list por projeto, com check e uncheck;
- quadro visual estilo Miro para boards, imagens, cores e ligacoes;
- calculadora de horas por fase e tarefa com as percentagens do projeto Godot;
- codigo de acesso simples para abrir a app.

## Como abrir localmente

Abre o ficheiro `index.html` diretamente no browser.

Codigo de acesso atual:

```text
equipa2026
```

Os dados ficam guardados no browser atraves de `localStorage`. Isto e bom para testar a experiencia, mas ainda nao sincroniza automaticamente entre colegas.

## Como por online

Esta versao ja esta preparada para Supabase. Enquanto `config.js` tiver placeholders, a app funciona em modo local. Quando colocares as chaves reais, muda automaticamente para login online e guarda a workspace na base de dados.

### 1. Criar Supabase

1. Vai a `https://supabase.com` e cria um projeto.
2. Abre `SQL Editor`.
3. Cola e executa o conteudo de `supabase-schema.sql`.
4. Em `Authentication > Providers`, ativa `Email`.
5. Em `Project Settings > API`, copia:
   - Project URL
   - anon public key

### 2. Configurar a app

Edita `config.js`:

```js
window.FLOWBOARD_SUPABASE = {
  url: "https://O-TEU-PROJETO.supabase.co",
  anonKey: "A-TUA-ANON-PUBLIC-KEY",
  workspaceName: "FlowBoard Team"
};
```

### 3. Publicar

Opcoes simples:

- Vercel: cria um projeto e faz upload/ligacao ao repo desta pasta.
- Netlify: arrasta a pasta para deploy ou liga ao repo.

Como esta app e estatica, nao precisa de build. Os ficheiros principais sao `index.html`, `styles.css`, `app.js`, `config.js` e `vercel.json`.

### 4. Dar acesso aos colegas

Cada colega cria conta no login da app. Depois precisas de adicionar o `user_id` dele a `workspace_members`.

No Supabase, ve o `id` do utilizador em `Authentication > Users`, depois executa:

```sql
insert into public.workspace_members (workspace_id, user_id, role)
values ('WORKSPACE_ID_AQUI', 'USER_ID_DO_COLEGA_AQUI', 'member');
```

O `WORKSPACE_ID` esta na tabela `workspaces`.

## O que fica guardado online

- projetos;
- tarefas;
- total de horas por projeto;
- boards/imagens;
- posicao, tamanho, cor e texto dos boards;
- ligacoes entre boards;
- estado geral da workspace.

## O que mudou nesta versao

- O temporizador foi substituido por `SET HOURS`: escreves o total de horas do projeto e a app divide automaticamente pelas fases/tarefas.
- As percentagens usadas sao as mesmas do teu codigo Godot.
- O quadro usa boards e imagens, sem notas.
- Cada board pode mudar de cor atraves das bolinhas no topo.
- Cada board tambem tem seletor de cor livre e campo HEX.
- Os boards podem ser redimensionados pelo canto inferior direito.
- Podes arrastar imagens para o quadro ou colar imagens copiadas.
- A roda do rato faz zoom para ver o quadro mais longe ou mais perto.
- Clicar e arrastar no fundo do quadro move o ambiente.
- Boards podem usar texto rico com negrito, italico, sublinhado e riscado.
- Tambem podes aumentar/diminuir o tamanho da letra e escolher outro tipo de letra.
- Clica num board e usa `Ctrl+C` / `Ctrl+V` para duplicar mantendo cor, tamanho e texto.
- O topo dos boards tem menus separados para cores e estilos, para ficar menos cheio.
- Nas pontas das ligacoes ha pontos que podes arrastar para mudar o lado por onde a linha entra/sai do board.
- Ao trocar de projeto, o tamanho atual dos boards e guardado antes de mudar.
- Usa `Shift` + clique/pressionar para selecionar varios boards/imagens; depois larga o `Shift` e arrasta um deles para mover o grupo.
- Usa `Esc` para limpar selecao simples, selecao multipla e sair do modo de ligar boards.
- Clica num wire para o selecionar; `Shift` + clique seleciona varios wires/boards.
- Usa `Delete` para apagar os boards/wires selecionados.
- O quadro tem uma borda a marcar o limite da area de trabalho.
- Para ligar boards, clica em `Ligar boards`, escolhe o board de origem e depois o board de destino.
- O modo de ligar fica ativo para criares varias ligacoes seguidas.
- As ligacoes fazem angulos de 90 graus e tem um ponto que podes arrastar para ajustar o caminho.
- As areas `Horas do projeto` e `Task list` podem ser encolhidas/abertas pela seta.
- As gavetas laterais desaparecem para dar mais espaco ao quadro e abrem por botoes com icones.
- A esquerda, o icone de pasta abre os projetos.
- A direita, o relogio abre as horas do projeto e o certo abre a task list.
- A gaveta direita mostra apenas o painel escolhido: relogio para horas, certo para tarefas.
- Os projetos podem ser renomeados pelo botao `rename`.
- O botao `rename` transforma o nome do projeto num campo editavel.
- Projetos e boards ja podem ser apagados.

## Para usar pela internet com seguranca

Para a versao real online, o proximo passo deve ser ligar a app a um backend com autenticacao. A opcao mais simples seria:

- frontend em Vercel ou Netlify;
- base de dados e login com Supabase;
- convites por email para decidir quem pode entrar;
- armazenamento de imagens no Supabase Storage;
- sincronizacao em tempo real para tarefas e quadro.

O codigo de acesso que existe agora e apenas uma barreira de prototipo, porque qualquer app so com HTML/JS pode ser inspecionada no browser. Para "so entra quem eu quiser" a seguranca tem mesmo de ficar no servidor/backend.
