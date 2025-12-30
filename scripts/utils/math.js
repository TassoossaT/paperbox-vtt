// ===================
// Geometry Utilities
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
export function getProjectedDepth(x, y, elevation, tilt, rotation) {
    const rad = Math.PI / 180;
    const rotRad = rotation * rad;
    const tiltRad = tilt * rad;

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
    const rad = Math.PI / 180;
    const cosR = Math.cos(rotation * rad);
    const sinR = Math.sin(rotation * rad);

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

    if (overlapMax - overlapMin > 0.01) {
        // 2. If the walls occupy the same column of pixels, calculate the exact Z at that point
        const midU = (overlapMin + overlapMax) / 2;

        const getZatU = (p, u) => {
            const du = p.u1 - p.u0;
            // If the wall is perfectly in profile (vertical on the screen)
            if (Math.abs(du) < 0.1) return (p.z0 + p.z1) / 2;
            // Linear interpolation of depth based on U position
            const t = (u - p.u0) / du;
            return p.z0 + t * (p.z1 - p.z0);
        };

        const zA = getZatU(a, midU);
        const zB = getZatU(b, midU);

        // If there is a depth difference, it defines the order
        if (Math.abs(zA - zB) > 0.01) {
            return zA - zB; 
        }
    }

    // 3. Stable tie-breaker for walls that do not visually overlap
    return (a.minU + a.maxU) - (b.minU + b.maxU);
}