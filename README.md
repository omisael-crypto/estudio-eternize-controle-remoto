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

Automática: o Tampermonkey confere este endereço sozinho e troca o script quando sai versão nova.
Para forçar agora: painel do Tampermonkey → **Utilitários** → **Verificar atualizações de scripts**.
