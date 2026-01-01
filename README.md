# 📦 PaperBox VTT - Documentação Completa

**PaperBox VTT** é um módulo para Foundry VTT que transforma mapas 2D em ambientes 2.5D isométricos, inspirado no estilo visual de "Paper Mario". Paredes, portas e tokens são renderizados como sprites verticais com profundidade real, criando uma experiência visual única.

---

## 📑 Índice

1. [Funcionalidades](#-funcionalidades)
2. [Instalação e Uso](#-instalação-e-uso)
3. [Arquitetura do Código](#-arquitetura-do-código)
4. [Como Funciona - Passo a Passo](#-como-funciona---passo-a-passo)
5. [Estrutura de Arquivos](#-estrutura-de-arquivos)
6. [Desenvolvendo e Debugging](#-desenvolvendo-e-debugging)

---

## 🌟 Funcionalidades

- **Renderização 2.5D Isométrica**: Paredes, portas e tokens projetados verticalmente usando PIXI.js
- **Controles de Câmera em Tempo Real**: HUD intuitivo para ajustar inclinação (Tilt) e rotação
- **Depth Sorting Automático**: Sprites ordenados corretamente por profundidade baseado em intersecções
- **Animações de Portas**: Portas podem abrir/fechar com animações (swing, slide, etc.)
- **Configuração Individual**: Cada parede/token pode ter texturas e alturas personalizadas
- **Sincronização com Lighting**: Sistema de iluminação do Foundry se adapta às transformações
- **Compatibilidade**: Testado em Foundry V13

---

## 🚀 Instalação e Uso

### Instalação

1. Clone este repositório na pasta `Data/modules/paperbox-vtt` do seu Foundry VTT
2. Inicie o Foundry VTT
3. Vá para **Gerenciar Módulos** e ative **PaperBox VTT**

### Uso Básico

#### 1. Ativar o Módulo
- Ative o módulo nas configurações
- Um HUD aparecerá com controles de câmera

#### 2. Configurar Paredes 3D
1. Selecione a ferramenta de Paredes
2. Clique duplo em uma parede para abrir configuração
3. Na seção **PaperBox 3D**:
   - ✅ Marque **Enable 3D Wall**
   - 🖼️ Selecione uma **Texture** (imagem da parede)
   - 📏 Defina **Height (px)** (altura em pixels)
4. Salve

#### 3. Configurar Tokens 3D
1. Clique duplo em um token
2. Na seção **PaperBox 3D**:
   - ✅ Marque **Enable 3D Token**
   - 📏 Defina **Elevation** (elevação)
3. Salve

#### 4. Ajustar Câmera
Use o HUD para controlar a visualização:
- **Tilt Slider**: Inclinação vertical (0-90°)
- **Rotation Slider**: Rotação horizontal (-180° a 180°)
- **🔒 Lock Buttons**: Travar valores
- **⬆️⬇️⬅️➡️**: Ajustes finos

---

## 🏗️ Arquitetura do Código

### Hierarquia de Responsabilidades

```
┌─────────────────────────────────────────────────┐
│           FOUNDRY VTT (Motor Base)              │
└────────────────────┬────────────────────────────┘
                     │
            ┌────────▼─────────┐
            │    main.js       │  ◄─── Ponto de entrada
            │ (Inicialização)  │
            └────────┬─────────┘
                     │
        ┌────────────▼──────────────┐
        │    PaperBox.js            │  ◄─── Orquestrador Global
        │ (Coordena tudo)           │
        └──┬────┬────┬─────┬────┬──┘
           │    │    │     │    │
    ┌──────▼┐ ┌▼────▼┐ ┌──▼───┐│
    │Render │ │Input │ │Light ││
    │Engine │ │Mngr  │ │Mngr  ││
    └───────┘ └──────┘ └──────┘│
                     ┌──────────▼──────────┐
                     │  SceneRenderer      │  ◄─── Manager por Cena
                     │ (Uma por mapa)      │
                     └──┬──────┬─────┬────┘
                        │      │     │
              ┌─────────▼┐ ┌───▼────┐▼──────┐
              │World3D   │ │Wall    │Token  │
              │Orchestr. │ │Builder │Builder│
              └──────────┘ └────────┴───────┘
```

### Camadas e Responsabilidades

#### 🔴 Camada 1: Inicialização Global

**`scripts/main.js`**
- Ponto de entrada do módulo
- Registra settings do Foundry
- Cria instância singleton de `PaperBox`
- Expõe `game.paperbox` globalmente

**`scripts/core/patcher.js`**
- Corrige métodos PIXI incompatíveis
- Redirectiona `getLocalPosition()` para `rotationContainer`
- Essencial para ferramentas (Ruler, Dragging) funcionarem

#### 🟠 Camada 2: Orquestrador Principal

**`scripts/core/PaperBox.js`**
- **Responsabilidade**: Coordenar TODOS os subsistemas
- **Estado Global**: `{ tilt, rotation, lockedTilt, lockedRotation }`
- **Subsistemas**:
  - `renderEngine`: Aplica transformações PIXI
  - `inputManager`: Captura mouse/teclado
  - `lightManager`: Atualiza iluminação
  - `hud`: Interface visual
- **Lifecycle**:
  - `initialize()`: Setup inicial
  - `toggle(active)`: Liga/desliga módulo
  - `_onCanvasReady()`: Cria SceneRenderer para nova cena
  - `_onCanvasTearDown()`: Destroi SceneRenderer ao sair

**Métodos Públicos**:
```javascript
paperbox.toggle(true/false)        // Ativar/desativar
paperbox.setState({ tilt: 45 })    // Mudar estado
paperbox.fullRefresh()             // Recarregar tudo
```

#### 🟡 Camada 3: Subsistemas Globais

**`scripts/engine/RenderEngine.js`**
- **Loop de Renderização**: Executa a cada frame (60 FPS)
- **Transformações PIXI**:
  - `tiltContainer.scale.y = cos(tilt)` → Perspectiva vertical
  - `rotationContainer.angle = rotation` → Rotação horizontal
- **Pivô Dinâmico**: Sincroniza com câmera do Foundry
- **Métodos**:
  - `activate()`: Inicia loop
  - `deactivate()`: Para loop
  - `_onTick()`: Executado cada frame
  - `_updateVisuals()`: Aplica transformações

**`scripts/system/InputManager.js`**
- **Captura Interação**: Mouse + Teclado
- **Funcionalidades**:
  - Drag&Drop no canvas para rotacionar (Shift + Drag)
  - Atalhos de teclado
  - Pan da câmera

**`scripts/engine/LightManager.js`**
- **Sincronização de Luz**: Força Foundry recalcular iluminação após transformações
- **Throttling**: Evita recalcular luz a cada frame (otimização)

**`scripts/ui/HUD.js`**
- **Interface Visual**: Painéis de controle flutuantes
- **2 Painéis**:
  - Tilt (inclinação)
  - Rotation (rotação)
- **Draggable**: Posições salvas em settings
- **Callbacks**: Comunica mudanças ao PaperBox

#### 🟢 Camada 4: Renderização por Cena

**`scripts/core/scene/SceneRenderer.js`**
- **Responsabilidade**: Gerenciar conteúdo de UMA cena específica
- **Lifecycle**:
  - `constructor()`: Cria builders para esta cena
  - `init()`: Carrega dados do Foundry (async)
  - `activate()`: Mostra sprites, registra hooks
  - `deactivate()`: Esconde sprites
  - `destroy()`: Limpa memória (RAM + GPU)
- **Builders**:
  - `wallBuilder`: Paredes normais
  - `doorBuilder`: Portas (herda de WallBuilder)
  - `tokenBuilder`: Tokens/personagens
- **Hooks Registrados**:
  - `updateWall`, `createWall`, `deleteWall`
  - `updateToken`, `createToken`, `deleteToken`
  - ⚠️ **Importante**: Hooks são desregistrados em `destroy()` para evitar múltiplas injeções de HTML

**`scripts/core/scene/world3DContainer.js`**
- **Orquestrador de Profundidade**: Calcula Z-order correto
- **Algoritmo de Intersecções**:
  - Detecta onde paredes se cruzam
  - Divide paredes em sub-segmentos
  - Ordena sprites por profundidade projetada
- **Métodos**:
  - `globalIntersections()`: Detecta intersecções entre todas as paredes
  - `depthUpdate()`: Recalcula Z-order de todos os sprites
  - `syncMovingTokens()`: Detecta tokens em movimento

#### 🔵 Camada 5: Builders (Construtores de Conteúdo)

**`scripts/core/scene/worldContainers/WallBuilder.js`**
- **Responsabilidade**: Criar sprites PIXI para paredes
- **Dados de Entrada**: `canvas.walls.placeables`
- **Processo**:
  1. Filtrar paredes com flag `is3D = true`
  2. Detectar intersecções
  3. Dividir em sub-segmentos
  4. Criar sprites PIXI com texturas
  5. Calcular transformações (posição, escala, rotação)
- **Hooks**:
  - `renderWallConfig`: Injeta HTML customizado no formulário
  - `updateWall`: Atualiza sprite quando dados mudam
  - `createWall/deleteWall`: Adiciona/remove sprites
- **Cleanup**: `destroy()` desregistra hooks

**`scripts/core/scene/worldContainers/DoorBuilder.js`**
- **Herda**: `WallBuilder`
- **Adiciona**: Sistema de animação de portas
- **Animações Suportadas**:
  - `swing`: Porta gira (dobradiça)
  - `slide`: Porta desliza
  - `ascend/descend`: Porta sobe/desce
- **Estados**: Closed, Open, Locked

**`scripts/core/scene/worldContainers/TokenBuilder.js`**
- **Responsabilidade**: Criar sprites 3D para tokens
- **Features**:
  - Elevação (altura do token)
  - Sincronização com movimento
  - Depth sorting por posição
- **Hooks**:
  - `renderTokenConfig`: Injeta HTML no formulário
  - `updateToken`: Detecta mudanças (estrutura vs movimento)
  - `createToken/deleteToken`: Adiciona/remove sprites
- **Cleanup**: `destroy()` desregistra hooks

**`scripts/core/scene/worldContainers/TileBuilder.js`**
- **Responsabilidade**: Tiles 3D (futuro)
- **Status**: Implementação parcial
- **Hooks**:
  - `renderTileConfig`: Injeta HTML
  - `refreshTile`: Atualiza transformação
- **Cleanup**: `destroy()` desregistra hooks

#### 🔷 Camada 6: Utilitários

**`scripts/utils/constants.js`**
- Constantes globais (MODULE_ID, etc.)

**`scripts/utils/math.js`**
- Funções matemáticas:
  - `calculateWallTransform()`: Calcula matriz de transformação
  - `getSegmentProjection()`: Projeção oblíqua
  - `compareSegments()`: Comparação de profundidade
  - `findIntersectionT()`: Intersecção de segmentos

**`scripts/utils/dom.js`**
- Geração de HTML para formulários de configuração
- `getWall3DConfigHTML()`: HTML para paredes
- `getTokenConfigHTML()`: HTML para tokens

---

## 🎬 Como Funciona - Passo a Passo

### Cenário: Usuário Ativa o Módulo

#### Passo 1: Inicialização
```javascript
// Foundry dispara hook 'init'
Hooks.once('init', () => {
    registerPatches();              // Corrige PIXI
    game.paperbox = new PaperBox(); // Singleton
});
```

#### Passo 2: Usuário Ativa nas Settings
```javascript
game.settings.set('paperbox-vtt', 'enabled', true);
// Callback dispara:
paperbox.toggle(true);
```

#### Passo 3: PaperBox.toggle(true)
```javascript
toggle(true) {
    document.body.classList.add("paperbox-active");
    
    // Mostrar HUD
    this.hud.render();
    
    // Iniciar loop de renderização
    this.renderEngine.activate();
    
    // Ativar input
    this.inputManager.activate();
    
    // Se há cena carregada, criar SceneRenderer
    if (canvas.ready) {
        this._onCanvasReady();
    }
}
```

#### Passo 4: Loop de Renderização (60 FPS)
```javascript
_onTick() {
    // 1. Sincronizar pivô com câmera Foundry
    this._syncPivot();
    
    // 2. Aplicar transformações visuais
    tiltContainer.scale.y = Math.cos(tilt * DEG_TO_RAD);
    rotationContainer.angle = rotation;
    
    // 3. Atualizar iluminação
    lightManager.refresh();
    
    // 4. Reordenar profundidade
    orchestrator.depthUpdate();
}
```

#### Passo 5: SceneRenderer Criado
```javascript
_onCanvasReady() {
    const sceneId = canvas.scene.id;
    this.currentSceneRenderer = new SceneRenderer(this, sceneId);
    
    await this.currentSceneRenderer.init();
    // Builders carregam dados:
    // - WallBuilder lê canvas.walls
    // - TokenBuilder lê canvas.tokens
    
    this.currentSceneRenderer.activate();
    // Sprites aparecem no canvas
}
```

### Cenário: Usuário Configura Parede 3D

#### Passo 1: Abrir Formulário
```
Usuário: Duplo-clique na parede
Foundry: Abre WallConfig form
```

#### Passo 2: Hook renderWallConfig Disparado
```javascript
// WallBuilder._onRenderWallConfig()
Hooks.on("renderWallConfig", (app, html, data) => {
    // Injeta HTML customizado
    const section = `
        <fieldset>
            <legend>PaperBox 3D</legend>
            <input type="checkbox" name="flags.paperbox-vtt.is3D">
            <input type="text" name="flags.paperbox-vtt.texture">
            <input type="number" name="flags.paperbox-vtt.height">
        </fieldset>
    `;
    html.find('.scrollable').append(section);
});
```

#### Passo 3: Usuário Marca "Enable 3D"
```
Usuário preenche:
✅ Enable 3D Wall
🖼️ Texture: walls/brick.png
📏 Height: 200px

Clica "Update Wall"
```

#### Passo 4: Hook updateWall Disparado
```javascript
Hooks.on("updateWall", (wallDoc, changes) => {
    // WallBuilder detecta mudança
    if (changes.flags?.["paperbox-vtt"]) {
        // Recriar sprite com nova textura
        this.createWall(wallDoc);
    }
});
```

#### Passo 5: Sprite PIXI Criado
```javascript
async createWall(wallDoc) {
    const texture = await loadTexture(wallDoc.getFlag(..., "texture"));
    const height = wallDoc.getFlag(..., "height");
    
    const sprite = new PIXI.Sprite(texture);
    sprite.height = height;
    
    // Calcular transformação
    const transform = calculateWallTransform(wall, tilt, rotation);
    sprite.position.set(transform.x, transform.y);
    sprite.rotation = transform.angle;
    
    // Adicionar ao container
    this.container.addChild(sprite);
    this.sprites.set(wallDoc.id, sprite);
}
```

---

## 📁 Estrutura de Arquivos

```
paperbox-vtt/
├── module.json                      # Manifest do módulo
├── README.md                        # 📖 Esta documentação
│
├── scripts/
│   ├── main.js                      # Ponto de entrada
│   │
│   ├── core/                        # 🔴 Núcleo do sistema
│   │   ├── PaperBox.js              # Orquestrador global
│   │   ├── patcher.js               # Patches PIXI
│   │   │
│   │   └── scene/                   # 🟢 Renderização por cena
│   │       ├── SceneRenderer.js     # Manager da cena
│   │       ├── world3DContainer.js  # Depth sorting
│   │       │
│   │       └── worldContainers/     # 🔵 Builders
│   │           ├── WallBuilder.js   # Paredes
│   │           ├── DoorBuilder.js   # Portas
│   │           ├── TokenBuilder.js  # Tokens
│   │           ├── TileBuilder.js   # Tiles
│   │           ├── TerrainWallBuilder.js  # (Futuro)
│   │           └── WindowBuilder.js       # (Futuro)
│   │
│   ├── engine/                      # 🟡 Motor de renderização
│   │   ├── RenderEngine.js          # Loop PIXI
│   │   └── LightManager.js          # Sincronização luz
│   │
│   ├── system/                      # 🟡 Sistemas auxiliares
│   │   └── InputManager.js          # Input mouse/teclado
│   │
│   ├── ui/                          # 🟡 Interface
│   │   └── HUD.js                   # Painéis de controle
│   │
│   └── utils/                       # 🔷 Utilitários
│       ├── constants.js             # Constantes
│       ├── math.js                  # Funções matemáticas
│       └── dom.js                   # Geração de HTML
│
├── styles/
│   └── paperbox.css                 # Estilos CSS
│
└── languages/
    └── en.json                      # Traduções
```

---

## 🔧 Desenvolvendo e Debugging

### Debugging no Console

```javascript
// Acessar instância global
game.paperbox

// Ver estado atual
game.paperbox.state
// { tilt: 45, rotation: 0, lockedTilt: false, lockedRotation: false }

// Ver SceneRenderer atual
game.paperbox.currentSceneRenderer

// Ver builders
game.paperbox.currentSceneRenderer.wallBuilder
game.paperbox.currentSceneRenderer.tokenBuilder

// Ver sprites
game.paperbox.currentSceneRenderer.wallBuilder.sprites
// Map { "wallId" => PIXI.Sprite }

// Forçar refresh completo
game.paperbox.fullRefresh()

// Ver orchestrator
game.paperbox.currentSceneRenderer.orchestrator

// Ver intersecções detectadas
game.paperbox.currentSceneRenderer.orchestrator.intersectionMap
// Map { "wallId" => Set[0, 0.5, 1] }
```

### Problemas Comuns

#### 1. HTML Duplicado nos Formulários
**Causa**: Hooks não foram desregistrados
**Solução**: Verificar se `destroy()` dos builders está sendo chamado

#### 2. Sprites Não Aparecem
**Causa**: Textura não carregada ou flag `is3D` não definida
**Solução**: 
```javascript
// Verificar flags
canvas.walls.placeables[0].document.getFlag("paperbox-vtt", "is3D")
```

#### 3. Profundidade Errada
**Causa**: Intersecções não detectadas
**Solução**:
```javascript
// Forçar recalculo
game.paperbox.currentSceneRenderer.orchestrator.globalIntersections()
game.paperbox.currentSceneRenderer.orchestrator.depthUpdate()
```

#### 4. Performance Ruim
**Causa**: Muitos sprites ou recalculos excessivos
**Soluções**:
- Reduzir número de paredes 3D
- Otimizar texturas (tamanho menor)
- Verificar throttling do LightManager

### Adicionando Novos Builders

```javascript
// 1. Criar arquivo: scripts/core/scene/worldContainers/MyBuilder.js
export class MyBuilder {
    constructor(paperbox, container) {
        this.paperbox = paperbox;
        this.container = container;
        this._hookIds = [];
    }
    
    init() {
        this._hookIds.push(Hooks.on("myHook", this._onMyHook.bind(this)));
    }
    
    destroy() {
        for (const id of this._hookIds) {
            Hooks.off("myHook", id);
        }
        this._hookIds = [];
    }
}

// 2. Adicionar em SceneRenderer.js
import { MyBuilder } from "./worldContainers/MyBuilder.js";

constructor(paperbox, sceneId) {
    // ...
    this.myBuilder = new MyBuilder(this.paperbox, this.orchestrator.container);
}

async init() {
    this.myBuilder.init();
}

destroy() {
    if (this.myBuilder) {
        this.myBuilder.destroy?.();
        this.myBuilder = null;
    }
}
```

---

## 📝 Créditos

Desenvolvido por **Tasso ossaT**

### Tecnologias
- **Foundry VTT V13**
- **PIXI.js** (renderização 2D)
- **JavaScript ES6+**

---

## 🐛 Changelog

### v1.2.0 (Janeiro 2026)
- 🔧 Corrigido: Múltiplas injeções de HTML nos formulários
- 🔧 Corrigido: Hooks não eram desregistrados corretamente
- ✨ Adicionado: Sistema de cleanup com `destroy()` em todos os builders
- ✨ Adicionado: TileBuilder com hooks registrados
- 📚 Documentação unificada em README.md

### v1.1.0
- ✨ Refatoração arquitetural completa
- ✨ SceneRenderer gerencia ciclo de vida por cena
- ✨ PaperBox como orquestrador global
- 🔧 Movidos arquivos para organização hierárquica

### v1.0.0
- 🎉 Lançamento inicial
- ✨ Renderização 2.5D básica
- ✨ HUD com controles de câmera
- ✨ Suporte para paredes e tokens 3D
