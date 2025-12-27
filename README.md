# PaperBox VTT

**PaperBox VTT** é um módulo para Foundry VTT que transforma seus mapas em um ambiente 2.5D isométrico, inspirado no estilo visual de "Paper Mario". Ele permite renderizar paredes como sprites verticais que reagem à perspectiva da câmera, criando uma sensação de profundidade única.

## 🌟 Funcionalidades

- **Renderização 2.5D**: Paredes são projetadas verticalmente usando transformações de matriz PIXI.js.
- **Controles de Câmera em Tempo Real**: Um HUD intuitivo permite ajustar a inclinação (Tilt) e rotação da projeção para encontrar o ângulo perfeito.
- **Configuração por Parede**: Escolha quais paredes são 3D, defina suas texturas e alturas individualmente.
- **Compatibilidade**: Suporte verificado para Foundry V13, com sistema robusto de carregamento de texturas.

## 🚀 Instalação

1. Baixe o módulo ou clone este repositório na pasta `Data/modules/paperbox-vtt` do seu Foundry VTT.
2. Inicie o Foundry VTT.
3. Vá para a aba **Gerenciar Módulos** e ative o **PaperBox VTT**.

## 📖 Como Usar

### 1. Configurando uma Parede 3D
Para transformar uma parede comum em um objeto 3D:
1. Selecione a ferramenta de Paredes.
2. Dê um clique duplo em uma parede existente para abrir a configuração.
3. Na seção **PaperBox 3D**:
   - Marque a opção **Enable 3D Wall**.
   - Selecione uma **Textura** (imagem da parede/objeto).
   - Defina a **Altura (Height)** em pixels.
4. Salve as alterações.

### 2. Ajustando a Visualização (HUD)
Ao ativar o módulo, um HUD aparecerá na tela (canto superior direito por padrão).
- **Tilt**: Controla a inclinação vertical das paredes.
- **Rotation**: Gira a projeção das paredes para alinhar com a perspectiva desejada.
- Use os botões de seta para ajustes finos.

## 🛠️ Detalhes Técnicos

O módulo utiliza `PIXI.Matrix` para calcular a projeção oblíqua das sprites baseada na geometria da parede no canvas. Ele intercepta o ciclo de renderização de paredes do Foundry para injetar sprites PIXI customizados, garantindo performance e integração suave.

## 📝 Créditos

Desenvolvido por **Tasso ossaT**.
