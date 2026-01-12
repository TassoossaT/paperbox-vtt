// Como o Foundry calcula iluminação?
// O Foundry usa um sistema 2D baseado em shaders WebGL/PIXI.
// Cada fonte de luz é um objeto PIXI.Light ou similar, que projeta luz sobre polígonos (paredes, tokens, tiles) usando máscaras e blend modes.
// O canvas tem camadas: background, iluminação, tokens, efeitos, etc.
// A camada de iluminação é um container PIXI com filtros (shaders) aplicados, que misturam as luzes e sombras sobre a cena.
// O cálculo de sombras é feito por raycasting 2D: a luz "vê" até onde pode ir, parando em paredes (edges).
// Como adaptar para 3D?
// LightManager 3D:

// Em vez de só criar fontes de luz 2D, você pode criar uma estrutura que armazene posição (x, y, z), cor, intensidade, alcance, etc.
// Para cada frame, calcule a projeção da luz em 3D sobre os objetos (paredes, tokens, tiles), levando em conta altura e profundidade.
// Cálculo de sombras:

// Em 3D, a sombra não é só um polígono 2D. Você precisa projetar a luz sobre superfícies verticais e horizontais.
// Pode-se usar raycasting 3D simplificado: para cada luz, calcule quais faces dos objetos estão visíveis e iluminadas.
// Para um efeito visual, pode-se "extrudar" as paredes para cima e projetar sombras como polígonos 2.5D.
// Filtros e Shaders:

// O Foundry aplica filtros (PIXI.Filter) na camada de iluminação.
// Para 3D, você pode criar um shader customizado (GLSL) que recebe informações de altura e aplica gradientes/sombras conforme a posição z.
// Outra abordagem: desenhar as sombras manualmente em uma textura, depois aplicar como overlay.
// Integração com o Canvas:

// Substitua ou sobreponha a camada de iluminação padrão do Foundry.
// Use seu LightManager para criar e atualizar as luzes 3D, e renderize o resultado em uma camada PIXI própria.
// Se necessário, desative a iluminação padrão do Foundry para evitar conflitos visuais.


export class LightManager {
    constructor(paperbox) {
        this.paperbox = paperbox;
    }

    /**
     * Força o Foundry a recalcular a iluminação e o campo de visão (FOV).
     * Chame este método dentro do seu loop de rotação/tilt.
     */
    refresh() {
        if (!canvas.ready || !canvas.perception) return;

        // O parâmetro 'true' no final força a atualização imediata (imediate: true)
        canvas.perception.update({
            refreshVision: true,
            refreshLighting: true,
            refreshSounds: false,
            refreshTiles: false
        }, true);
    }
}
