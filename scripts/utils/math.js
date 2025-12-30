

// ===================
// Geometry and Projection
// ===================

/**
 * Returns the basic geometry of a segment (wall): length, angle, and midpoint.
 * @param {Object} p0 - Start point {x, y}
 * @param {Object} p1 - End point {x, y}
 * @returns {Object} Geometry info
 */
export function getWallGeometry(p0, p1) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    return {
        length: Math.sqrt(dx * dx + dy * dy),
        angle: Math.atan2(dy, dx),
        midX: (p0.x + p1.x) / 2,
        midY: (p0.y + p1.y) / 2
    };
}

/**
 * Calculates the vertical projection vector for 2.5D ("lift vector").
 * @param {number} height - Height in grid pixels
 * @param {number} tilt - Tilt angle (0-90)
 * @param {number} rotation - Board rotation (-180 to 180)
 * @returns {Object} {x, y} projection vector
 */
export function getProjectionVector(height, tilt, rotation) {
    const rad = Math.PI / 180;
    const upAngle = (-90 - rotation) * rad;
    const factor = 1 / Math.max(0.01, Math.cos(tilt * rad));
    const upLen = height * factor;
    return {
        x: upLen * Math.cos(upAngle),
        y: upLen * Math.sin(upAngle)
    };
}

/**
 * Returns the projected depth (zIndex) for a point, considering tilt and elevation.
 * @param {number} x
 * @param {number} y
 * @param {number} elevation
 * @param {number} tilt
 * @param {number} rotation
 * @returns {number} Projected depth
 */
// utils/math.js

export function getProjectedDepth(x, y, elevation, tilt, rotation) {
    const rad = Math.PI / 180;
    const rotRad = rotation * rad;
    const tiltRad = tilt * rad;

    const yr = (x * Math.sin(rotRad)) + (y * Math.cos(rotRad));
    const depth = (yr * Math.cos(tiltRad)) + ((elevation) * Math.sin(tiltRad));
    
    return depth;
}



// ===================
// Intersection and Visibility
// ===================

/**
 * Returns the intersection parameter t if two segments cross, otherwise null.
 * @param {Object} p1
 * @param {Object} p2
 * @param {Object} p3
 * @param {Object} p4
 * @returns {number|null}
 */
export function findIntersectionT(p1, p2, p3, p4) {
    const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (den === 0) return null; // Parallel
    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
    if (t > 0.001 && t < 0.999 && u > 0 && u < 1) return t;
    return null;
}



/**
 * Projeta um segmento para o espaço da tela (U = horizontal, Z = profundidade).
 */
/**
 * Projeta um segmento para o "Espaço da Câmera".
 * U = Posição horizontal na tela.
 * Z = Profundidade (distância da câmera).
 */
export function getSegmentProjection(coords, rotation) {
    const rad = Math.PI / 180;
    const cosR = Math.cos(rotation * rad);
    const sinR = Math.sin(rotation * rad);

    // Projetamos os dois pontos (p0 e p1) no plano do chão rotacionado
    const project = (x, y) => ({
        u: x * cosR - y * sinR,
        z: x * sinR + y * cosR
    });

    const p0 = project(coords[0], coords[1]);
    const p1 = project(coords[2], coords[3]);

    return {
        u0: p0.u, z0: p0.z,
        u1: p1.u, z1: p1.z,
        minU: Math.min(p0.u, p1.u),
        maxU: Math.max(p0.u, p1.u)
    };
}

/**
 * Compara dois segmentos projetados para determinar qual está à frente.
 * Retorna < 0 se A estiver atrás de B, > 0 se A estiver à frente.
 */
export function compareSegments(a, b) {
    // 1. Verifica se há sobreposição horizontal na tela (U)
    const overlapMin = Math.max(a.minU, b.minU);
    const overlapMax = Math.min(a.maxU, b.maxU);

    if (overlapMax - overlapMin > 0.01) {
        // 2. Se as paredes ocupam a mesma coluna de pixels, calculamos o Z exato naquele ponto
        const midU = (overlapMin + overlapMax) / 2;

        const getZatU = (p, u) => {
            const du = p.u1 - p.u0;
            // Caso a parede esteja perfeitamente de perfil (vertical na tela)
            if (Math.abs(du) < 0.1) return (p.z0 + p.z1) / 2;
            
            // Interpolação linear da profundidade baseada na posição U
            const t = (u - p.u0) / du;
            return p.z0 + t * (p.z1 - p.z0);
        };

        const zA = getZatU(a, midU);
        const zB = getZatU(b, midU);

        // Se houver diferença de profundidade, ela define a ordem
        if (Math.abs(zA - zB) > 0.01) {
            return zA - zB; 
        }
    }

    // 3. Desempate estável para paredes que não se sobrepõem visualmente
    return (a.minU + a.maxU) - (b.minU + b.maxU);
}