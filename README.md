# Estúdio Eternize (Tampermonkey)

Controle remoto do Estúdio Eternize: um botão dentro do chat da Leona que separa as fotos do cliente por pessoa e manda para o Estúdio (aplicativo do Windows) gerar a prévia e o vídeo.
O script não guarda senha nem dado de cliente: ele só fala com o Estúdio que está aberto no seu próprio computador.

## Instalar (uma vez)

1. Instale o **Tampermonkey** no Chrome (Chrome Web Store).
2. Em `chrome://extensions`, abra **Detalhes** do Tampermonkey e ligue **Permitir scripts de usuário**.
3. Abra este link e clique em **Instalar**:
   https://raw.githubusercontent.com/omisael-crypto/estudio-eternize-controle-remoto/main/estudio-leona.user.js
4. Deixe o aplicativo do Estúdio aberto, abra a Leona e aperte F5. O botão aparece ao lado de "Traduzir mensagens recebidas".

Se você tinha a extensão "carregada sem compactação", remova-a para o botão não aparecer duas vezes.

## Atualização

**Automática e rápida.** O script que você instala é um *carregador* pequeno. Ele baixa o código do controle remoto deste repositório e, a cada poucos minutos, confere se saiu versão nova. Quando sai, ele recarrega a Leona sozinho assim que você não estiver no meio de nada (painel do Estúdio fechado, sem mensagem sendo digitada, sem envio em andamento). Você não precisa fazer nada.

Para forçar agora: menu do Tampermonkey (ícone) → **Atualizar o Estúdio agora**.

### Reserva
Se o Chrome não deixar o carregador rodar (o botão do Estúdio não aparece), instale no lugar a versão completa:
https://raw.githubusercontent.com/omisael-crypto/estudio-eternize-controle-remoto/main/estudio-completo.user.js
Essa se atualiza pelo Tampermonkey (confere em geral uma vez por dia).
