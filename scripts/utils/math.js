

// ===================
// Geometry Utilities
// ===================
/**
 * Calcula a transformação 2.5D suportando Swing, Slide e Ascend/Descend.
 */
/**
 * Calcula a matriz de transformação 2.5D suportando Swing, Slide e Ascend/Descend.
 */
export function calculateWallTransform(data) {
    const { coords, height, tilt, rotation, doorAngle = 0, doorPivot = null, slide = 0, lift = 0 } = data;

    // 1. Pontos iniciais
    let p0 = { x: coords[0], y: coords[1] };
    let p1 = { x: coords[2], y: coords[3] };

    // 2. Aplica Swing/Swivel (Rotação)
    if (doorAngle !== 0 && doorPivot) {
        p0 = rotatePointAround(p0, doorPivot, doorAngle);
        p1 = rotatePointAround(p1, doorPivot, doorAngle);
    }

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const wallAngle = Math.atan2(dy, dx);

    // 3. Aplica Slide (Correr)
    // Importante: Precisamos mover P0 e P1 para que o Sort funcione!
    if (slide !== 0) {
        const moveX = Math.cos(wallAngle) * (length * slide);
        const moveY = Math.sin(wallAngle) * (length * slide);
        
        p0.x += moveX;
        p0.y += moveY;
        p1.x += moveX;
        p1.y += moveY;
    }

    // O centro do sprite será o novo ponto médio após rotação e slide
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;

    // 4. Aplica Projeção Vertical (Tilt/Rotation da Câmera)
    const { x: upX, y: upY } = getProjectionVector(height, tilt, rotation);
    
    // TX e TY são a posição final na tela, considerando o "Lift" (elevação)
    const tx = midX + (upX * lift);
    const ty = midY + (upY * lift);

    return {
        matrixParams: {
            a: Math.cos(wallAngle),
            b: Math.sin(wallAngle),
            c: -upX / height,
            d: -upY / height,
            tx, 
            ty
        },
        length,
        liveCoords: [p0.x, p0.y, p1.x, p1.y]
    };
}
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
 * Returns the length of a wall segment given as [x0, y0, x1, y1].
 * @param {Array} coords - Array of coordinates [x0, y0, x1, y1]
 * @returns {number} Length of the wall
 */
export function getWallLength(coords) {
    const dx = coords[2] - coords[0];
    const dy = coords[3] - coords[1];
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Returns a sub-segment of a wall between tStart and tEnd (0-1).
 * @param {Array} coords - Array of coordinates [x0, y0, x1, y1]
 * @param {number} tStart - Start parameter (0-1)
 * @param {number} tEnd - End parameter (0-1)
 * @returns {Array} Sub-segment coordinates [x0, y0, x1, y1]
 */
export function getWallSubSegment(coords, tStart, tEnd) {
    const dx = coords[2] - coords[0];
    const dy = coords[3] - coords[1];
    return [
        coords[0] + tStart * dx,
        coords[1] + tStart * dy,
        coords[0] + tEnd * dx,
        coords[1] + tEnd * dy
    ];
}
/**
 * Rotaciona um ponto em torno de um pivot por um ângulo (rad).
 * @param {{x:number, y:number}} point
 * @param {{x:number, y:number}} pivot
 * @param {number} angleRad
 * @returns {{x:number, y:number}}
 */
export function rotatePointAround(point, pivot, angleRad) {
    const dx = point.x - pivot.x;
    const dy = point.y - pivot.y;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    return {
        x: pivot.x + dx * cosA - dy * sinA,
        y: pivot.y + dx * sinA + dy * cosA
    };
}
// ===================
// Projection Utilities
// ===================

/**
 * Calculates the vertical projection vector for 2.5D ("lift vector").
 * @param {number} height - Height in grid pixels
 * @param {number} tilt - Tilt angle (0-90)
 * @param {number} rotation - Board rotation (-180 to 180)
 * @returns {Object} {x, y} projection vector
 */
export function getProjectionVector(height, tilt, rotation) {
    const upAngle = Math.toRadians(-90 - rotation);
    // Corrigido: compensar o scale.y global (cos(tilt)), usando tan(tilt)
    // upLen = height * tan(tilt) = height * sin(tilt) / cos(tilt)
    const cosTilt = Math.max(0.01, Math.cos(Math.toRadians(tilt)));
    const sinTilt = Math.sin(Math.toRadians(tilt));
    const upLen = height * sinTilt / cosTilt;
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
export function getProjectedDepth(x, y, elevation, tilt, rotation) {
    const rotRad = Math.toRadians(rotation);
    const tiltRad = Math.toRadians(tilt);

    const yr = (x * Math.sin(rotRad)) + (y * Math.cos(rotRad));
    const depth = (yr * Math.cos(tiltRad)) + ((elevation) * Math.sin(tiltRad));
    return depth;
}

/**
 * Projects a segment to the camera space (U = horizontal screen position, Z = depth from camera).
 * @param {Array} coords - Array of coordinates [x0, y0, x1, y1]
 * @param {number} rotation - Rotation angle in degrees
 * @returns {Object} Projected segment info
 */
export function getSegmentProjection(coords, rotation) {
    const cosR = Math.cos(Math.toRadians(rotation));
    const sinR = Math.sin(Math.toRadians(rotation));

    // Project both points (p0 and p1) onto the rotated ground plane
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

// ===================
// Intersection Utilities
// ===================

/**
 * Returns the intersection parameter t if two segments cross, otherwise null.
 * @param {Object} p1 - Start point of first segment {x, y}
 * @param {Object} p2 - End point of first segment {x, y}
 * @param {Object} p3 - Start point of second segment {x, y}
 * @param {Object} p4 - End point of second segment {x, y}
 * @returns {number|null} Intersection parameter t or null if no intersection
 */
export function findIntersectionT(p1, p2, p3, p4) {
    const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (den === 0) return null; // Parallel
    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
    if (t > 0.001 && t < 0.999 && u > 0 && u < 1) return t;
    return null;
}

// ===================
// Comparison Utilities
// ===================

/**
 * Compares two projected segments to determine which is in front.
 * Returns < 0 if A is behind B, > 0 if A is in front of B.
 * @param {Object} a - First projected segment
 * @param {Object} b - Second projected segment
 * @returns {number} Comparison result
 */
export function compareSegments(a, b) {
    // 1. Check if there is horizontal overlap on the screen (U)
    const overlapMin = Math.max(a.minU, b.minU);
    const overlapMax = Math.min(a.maxU, b.maxU);

    if (overlapMax - overlapMin > 1e-6) {
        // 2. If the walls occupy the same column of pixels, calculate the exact Z at that point
        const midU = (overlapMin + overlapMax) / 2;

        const getZatU = (p, u) => {
            const du = p.maxU - p.minU;
            if (Math.abs(du) < 1e-6) {
                return (p.z0 + p.z1) / 2;
            }
            const t = (u - p.minU) / du;
            const zMin = p.u0 < p.u1 ? p.z0 : p.z1;
            const zMax = p.u0 < p.u1 ? p.z1 : p.z0;
            return zMin + t * (zMax - zMin);
        };
        const zA1 = getZatU(a, overlapMin + 0.25 * (overlapMax - overlapMin));
        const zA2 = getZatU(a, overlapMin + 0.75 * (overlapMax - overlapMin));

        const zB1 = getZatU(b, overlapMin + 0.25 * (overlapMax - overlapMin));
        const zB2 = getZatU(b, overlapMin + 0.75 * (overlapMax - overlapMin));

        return (zA1 + zA2) - (zB1 + zB2);
    }

    // 3. Stable tie-breaker for walls that do not visually overlap
    return ((a.z0 + a.z1) - (b.z0 + b.z1));
}
/**
 * Projeta um Token para o espaço de profundidade.
 * Tratamos tokens como um "segmento minúsculo" ou um ponto central com raio.
 */
export function getTokenProjection(token, rotation) {
    const cosR = Math.cos(Math.toRadians(rotation));
    const sinR = Math.sin(Math.toRadians(rotation));

    // Centro do token
    const x = token.x + (token.w / 2);
    const y = token.y + (token.h / 2);

    // Profundidade Z no sistema rotacionado
    const z = x * sinR + y * cosR;
    const u = x * cosR - y * sinR;

    return {
        u0: u - 1, u1: u + 1, // Pequena margem horizontal
        z0: z, z1: z,         // Profundidade plana
        minU: u - 1, maxU: u + 1,
        isPoint: true         // Flag para o comparador
    };
}
