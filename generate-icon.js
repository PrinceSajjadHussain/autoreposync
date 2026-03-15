/**
 * Generate a 128x128 PNG icon for AutoRepoSync.
 * Blue rounded-rect background with white sync arrows, center dot, and gold lightning bolt.
 */
const zlib = require('zlib');
const fs = require('fs');

const W = 128, H = 128;
const raw = Buffer.alloc((W * 4 + 1) * H);

function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const off = y * (W * 4 + 1) + 1 + x * 4;
    // Alpha blend over existing
    const ea = raw[off + 3] / 255;
    const na = a / 255;
    const oa = na + ea * (1 - na);
    if (oa === 0) return;
    raw[off]     = Math.round((r * na + raw[off] * ea * (1 - na)) / oa);
    raw[off + 1] = Math.round((g * na + raw[off + 1] * ea * (1 - na)) / oa);
    raw[off + 2] = Math.round((b * na + raw[off + 2] * ea * (1 - na)) / oa);
    raw[off + 3] = Math.round(oa * 255);
}

function dist(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function inRoundedRect(x, y, rx, ry, rw, rh, rad) {
    if (x < rx || x > rx + rw || y < ry || y > ry + rh) return false;
    if (x < rx + rad && y < ry + rad) return dist(x, y, rx + rad, ry + rad) <= rad;
    if (x > rx + rw - rad && y < ry + rad) return dist(x, y, rx + rw - rad, ry + rad) <= rad;
    if (x < rx + rad && y > ry + rh - rad) return dist(x, y, rx + rad, ry + rh - rad) <= rad;
    if (x > rx + rw - rad && y > ry + rh - rad) return dist(x, y, rx + rw - rad, ry + rh - rad) <= rad;
    return true;
}

function fillCircle(cx, cy, r, cr, cg, cb, ca) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            if (dist(x, y, cx, cy) <= r) setPixel(x, y, cr, cg, cb, ca);
        }
    }
}

function drawArc(cx, cy, r, thickness, startDeg, endDeg, cr, cg, cb, ca) {
    const inner = r - thickness / 2;
    const outer = r + thickness / 2;
    for (let y = Math.floor(cy - outer - 1); y <= Math.ceil(cy + outer + 1); y++) {
        for (let x = Math.floor(cx - outer - 1); x <= Math.ceil(cx + outer + 1); x++) {
            const d = dist(x, y, cx, cy);
            if (d >= inner && d <= outer) {
                let ang = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
                // Normalize angle
                while (ang < startDeg) ang += 360;
                while (ang > startDeg + 360) ang -= 360;
                if (ang >= startDeg && ang <= endDeg) {
                    // Anti-alias at edges
                    const edgeDist = Math.min(d - inner, outer - d);
                    const aa = Math.min(1, edgeDist * 2);
                    setPixel(x, y, cr, cg, cb, Math.round(ca * aa));
                }
            }
        }
    }
}

function drawTriangle(x1, y1, x2, y2, x3, y3, cr, cg, cb, ca) {
    const minX = Math.floor(Math.min(x1, x2, x3));
    const maxX = Math.ceil(Math.max(x1, x2, x3));
    const minY = Math.floor(Math.min(y1, y2, y3));
    const maxY = Math.ceil(Math.max(y1, y2, y3));

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const d1 = (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2);
            const d2 = (x - x3) * (y2 - y3) - (x2 - x3) * (y - y3);
            const d3 = (x - x1) * (y3 - y1) - (x3 - x1) * (y - y1);
            const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
            const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
            if (!(hasNeg && hasPos)) {
                setPixel(x, y, cr, cg, cb, ca);
            }
        }
    }
}

const cx = 64, cy = 64;

// Step 1: Draw background rounded rectangle (blue gradient)
for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0; // PNG filter byte
    for (let x = 0; x < W; x++) {
        if (inRoundedRect(x, y, 2, 2, 124, 124, 22)) {
            const t = ((x - 2) + (y - 2)) / 248;
            const r = Math.round(0 + t * 15);
            const g = Math.round(100 + t * 30);
            const b = Math.round(220 - t * 40);
            setPixel(x, y, r, g, b, 255);
        }
    }
}

// Step 2: Draw sync arrows (two arcs)
// Top arc (clockwise) - brighter
drawArc(cx, cy, 32, 8, -170, 50, 255, 255, 255, 230);
// Bottom arc (counter-clockwise) - dimmer
drawArc(cx, cy, 32, 8, 10, 230, 255, 255, 255, 140);

// Step 3: Arrow heads
// Arrow 1: at end of top arc (~50 degrees), pointing clockwise
{
    const angle = 50 * Math.PI / 180;
    const tipAngle = angle + 0.5;
    const tipX = cx + 32 * Math.cos(tipAngle);
    const tipY = cy + 32 * Math.sin(tipAngle);
    const backAngle = angle - 0.15;
    const innerX = cx + 22 * Math.cos(backAngle);
    const innerY = cy + 22 * Math.sin(backAngle);
    const outerX = cx + 42 * Math.cos(backAngle);
    const outerY = cy + 42 * Math.sin(backAngle);
    drawTriangle(tipX, tipY, innerX, innerY, outerX, outerY, 255, 255, 255, 230);
}

// Arrow 2: at end of bottom arc (~230 degrees), pointing counter-clockwise
{
    const angle = 230 * Math.PI / 180;
    const tipAngle = angle + 0.5;
    const tipX = cx + 32 * Math.cos(tipAngle);
    const tipY = cy + 32 * Math.sin(tipAngle);
    const backAngle = angle - 0.15;
    const innerX = cx + 22 * Math.cos(backAngle);
    const innerY = cy + 22 * Math.sin(backAngle);
    const outerX = cx + 42 * Math.cos(backAngle);
    const outerY = cy + 42 * Math.sin(backAngle);
    drawTriangle(tipX, tipY, innerX, innerY, outerX, outerY, 255, 255, 255, 140);
}

// Step 4: Center dot (git branch node)
fillCircle(cx, cy, 8, 255, 255, 255, 255);

// Step 5: Lightning bolt ⚡ (top-right)
const bx = 96, by = 12;
// Bolt shape as connected triangles
drawTriangle(bx + 2, by, bx + 10, by, bx + 4, by + 12, 255, 215, 0, 255);
drawTriangle(bx - 2, by + 10, bx + 10, by + 10, bx + 6, by + 24, 255, 215, 0, 255);
drawTriangle(bx + 2, by + 8, bx + 8, by + 8, bx + 2, by + 14, 255, 215, 0, 255);

// === PNG encoding ===
const deflated = zlib.deflateSync(raw, { level: 9 });

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let j = 0; j < 8; j++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
    const tBuf = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tBuf, data])));
    return Buffer.concat([len, tBuf, data, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflated),
    pngChunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync('media/icon.png', png);
console.log('Icon generated: ' + png.length + ' bytes (' + W + 'x' + H + ')');
