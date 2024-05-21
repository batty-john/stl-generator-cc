const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const THREE = require('three');
const fetch = require('node-fetch');
const config = require('./config.json');

// Main function to generate STL
async function generateSTL(imageUrl, hangars, outputDir) {
    try {
        // Ensure the output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Fetch the image from the server
        const response = await fetch(imageUrl);
        const buffer = await response.buffer();

        // Process the image with Jimp
        let image = await Jimp.read(buffer);
        const scalingFactor = Math.min(1, config.maxDimension / image.bitmap.width, config.maxDimension / image.bitmap.height);
        image.resize(image.bitmap.width * scalingFactor, image.bitmap.height * scalingFactor);
        await image.grayscale();

        // Add 1 px black border around the image
        image = await new Promise((resolve, reject) => {
            const newWidth = image.bitmap.width + 2;
            const newHeight = image.bitmap.height + 2;
            new Jimp(newWidth, newHeight, 0x000000FF, (err, borderedImage) => {
                if (err) {
                    reject(err);
                } else {
                    borderedImage.composite(image, 1, 1); // Composite the original image onto the new larger black image at position (1,1)
                    resolve(borderedImage); // Resolve the Promise with the new image
                }
            });
        });

        const width = image.bitmap.width;
        const height = image.bitmap.height;
        const vertices = [];
        const indices = [];

        // Generate vertices based on grayscale values
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const gray = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
                const z = config.maxThickness - (config.maxThickness - config.minThickness) * (gray / 255);
                vertices.push((width - 1 - x), y, z); // Mirror the x coordinate by subtracting x from width - 1
            }
        }

        // Generate indices for a simple grid
        for (let y = 0; y < height - 1; y++) {
            for (let x = 0; x < width - 1; x++) {
                const a = y * width + x;
                const b = a + 1;
                const c = a + width;
                const d = c + 1;
                indices.push(a, d, b); // first triangle with flipped normals
                indices.push(d, a, c); // second triangle with flipped normals
            }
        }

        // Create geometry and add vertices and indices
        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(indices);
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();

        // Add frame to the geometry
        const corners = addFrame(geometry, width, height, config.frameWidth, config.maxThickness);

        attachEdgesToFrame(geometry, width, height, corners);

        // Conditionally add hangars based on the parameter
        if (hangars) {
            addHangars(geometry, width, height, config.frameWidth, config.maxThickness, config);
        }

        // Scale the geometry according to the scale factor from config
        if (config.scaleFactor) {
            scaleGeometry(geometry, config.scaleFactor);
        }

        geometry.computeVertexNormals();

        // Create output paths
        const outputSTLPath = path.join(outputDir, 'output.stl');
        const outputBinarySTLPath = path.join(outputDir, 'output-binary.stl');

        // Export to STL
        const stlString = exportToSTL(geometry);
        fs.writeFileSync(outputSTLPath, stlString);
        console.log('STL file created successfully:', outputSTLPath);

        // Export Binary STL
        const binarySTL = exportToBinarySTL(geometry);
        fs.writeFileSync(outputBinarySTLPath, binarySTL);
        console.log('Binary STL file created successfully:', outputBinarySTLPath);
    } catch (err) {
        console.error('Error processing the image:', err);
    }
}

module.exports = generateSTL;

function scaleGeometry(geometry, scaleFactor) {
    const positionAttribute = geometry.getAttribute('position');
    const vertices = positionAttribute.array;
    for (let i = 0; i < vertices.length; i++) {
        vertices[i] *= scaleFactor;
    }
    positionAttribute.needsUpdate = true;
    if (geometry.attributes.normal) {
        geometry.computeVertexNormals();
    }
}

function addHangars(geometry, width, height, frameWidth, maxThickness, config) {
    if (config.hangars === 0) return;
    const positions = geometry.getAttribute('position').array;
    const indicesArray = geometry.getIndex().array;
    const numVertices = positions.length / 3;
    const hangarDepth = maxThickness;
    const hangarWidth = config.hangarWidth;
    const outerRadius = hangarWidth / 2;
    const innerRadius = outerRadius - config.hangarThickness;
    const segments = 16;
    const x1 = width / 5 - outerRadius;
    const x2 = 4 * width / 5 - outerRadius;
    const yTop = 0 - outerRadius;
    const zFront = maxThickness;
    const zBack = 0;
    const hangarVertices = [];
    const hangarIndices = [];

    function generateCylinder(centerX) {
        const baseIndex = numVertices + hangarVertices.length / 3;
        for (let j = 0; j < 2; j++) {
            const z = (j === 0) ? zFront : zBack;
            for (let r = 0; r < 2; r++) {
                const radius = (r === 0) ? outerRadius : innerRadius;
                for (let i = 0; i <= segments; i++) {
                    const angle = (Math.PI * 2 * i) / segments;
                    const vx = centerX + radius * Math.cos(angle);
                    const vy = yTop + radius * Math.sin(angle);
                    hangarVertices.push(vx, vy, z);
                }
            }
        }
        for (let i = 0; i < segments; i++) {
            const outerFront1 = baseIndex + i;
            const outerBack1 = baseIndex + i + segments + 1;
            const outerFront2 = baseIndex + (i + 1) % (segments + 1);
            const outerBack2 = baseIndex + ((i + 1) % (segments + 1)) + segments + 1;
            const innerFront1 = baseIndex + segments + 1 + segments + 1 + i;
            const innerBack1 = baseIndex + segments + 1 + segments + 1 + i + segments + 1;
            const innerFront2 = baseIndex + segments + 1 + segments + 1 + (i + 1) % (segments + 1);
            const innerBack2 = baseIndex + segments + 1 + segments + 1 + ((i + 1) % (segments + 1)) + segments + 1;
            hangarIndices.push(outerFront1, outerFront2, outerBack1);
            hangarIndices.push(outerBack1, outerFront2, outerBack2);
            hangarIndices.push(innerFront1, innerBack1, innerFront2);
            hangarIndices.push(innerBack1, innerBack2, innerFront2);
            hangarIndices.push(outerFront1, innerFront1, outerFront2);
            hangarIndices.push(innerFront1, innerFront2, outerFront2);
            hangarIndices.push(outerBack1, outerBack2, innerBack1);
            hangarIndices.push(innerBack1, outerBack2, innerBack2);
        }
    }

    generateCylinder(x1);
    generateCylinder(x2);

    const updatedVertices = new Float32Array(positions.length + hangarVertices.length);
    updatedVertices.set(positions);
    updatedVertices.set(hangarVertices, positions.length);

    const updatedIndices = new Uint32Array(indicesArray.length + hangarIndices.length);
    updatedIndices.set(indicesArray);
    updatedIndices.set(hangarIndices, indicesArray.length);

    geometry.setIndex(new THREE.BufferAttribute(updatedIndices, 1));
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(updatedVertices, 3));
}

function attachEdgesToFrame(geometry, width, height, corners) {
    const indices = geometry.getIndex().array;
    const newIndices = [];
    for (let i = 0; i < width; i++) {
        const topEdgeVertexIndex = i;
        newIndices.push(corners.topLeft, topEdgeVertexIndex, corners.topRight);
    }
    for (let i = 0; i < width; i++) {
        const bottomEdgeVertexIndex = (height - 1) * width + i;
        newIndices.push(corners.bottomLeft, corners.bottomRight, bottomEdgeVertexIndex);
    }
    for (let i = 0; i < height; i++) {
        const leftEdgeVertexIndex = i * width;
        newIndices.push(corners.bottomLeft, leftEdgeVertexIndex, corners.topLeft);
    }
    for (let i = 0; i < height; i++) {
        const rightEdgeVertexIndex = i * width + width - 1;
        newIndices.push(rightEdgeVertexIndex, corners.bottomRight, corners.topRight);
    }
    const updatedIndices = new Uint32Array(indices.length + newIndices.length);
    updatedIndices.set(indices);
    updatedIndices.set(newIndices, indices.length);
    geometry.setIndex(new THREE.BufferAttribute(updatedIndices, 1));
}

function addFrame(geometry, width, height, frameWidth, maxThickness) {
    const positions = geometry.getAttribute('position').array;
    const indicesArray = geometry.getIndex().array;
    const frameDepth = maxThickness;
    const offset = frameWidth;
    const frameVertices = [
        -offset, -offset, 0,
        width + offset, -offset, 0,
        width + offset, height + offset, 0,
        -offset, height + offset, 0,
        -offset, -offset, frameDepth,
        width + offset, -offset, frameDepth,
        width + offset, height + offset, frameDepth,
        -offset, height + offset, frameDepth,
    ];
    const numOldVertices = positions.length / 3;
    const updatedVertices = new Float32Array(positions.length + frameVertices.length);
    updatedVertices.set(positions);
    updatedVertices.set(frameVertices, positions.length);
    const baseIndex = numOldVertices;
    const newIndices = [
        baseIndex, baseIndex + 1, baseIndex + 5,
        baseIndex, baseIndex + 5, baseIndex + 4,
        baseIndex + 1, baseIndex + 2, baseIndex + 6,
        baseIndex + 1, baseIndex + 6, baseIndex + 5,
        baseIndex + 2, baseIndex + 3, baseIndex + 7,
        baseIndex + 2, baseIndex + 7, baseIndex + 6,
        baseIndex + 3, baseIndex, baseIndex + 4,
        baseIndex + 3, baseIndex + 4, baseIndex + 7,
        baseIndex, baseIndex + 2, baseIndex + 1,
        baseIndex, baseIndex + 3, baseIndex + 2,
    ];
    const updatedIndices = new Uint32Array(indicesArray.length + newIndices.length);
    updatedIndices.set(indicesArray);
    updatedIndices.set(newIndices, indicesArray.length);
    geometry.setIndex(new THREE.BufferAttribute(updatedIndices, 1));
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(updatedVertices, 3));
    const corners = {
        topRight: baseIndex + 4,
        topLeft: baseIndex + 5,
        bottomLeft: baseIndex + 6,
        bottomRight: baseIndex + 7,
    };
    return corners;
}

function exportToSTL(geometry) {
    const vertices = geometry.getAttribute('position').array;
    geometry.computeVertexNormals();
    const indices = geometry.getIndex().array;
    let stl = 'solid lithophane\n';
    for (let i = 0; i < indices.length; i += 3) {
        const index1 = indices[i] * 3;
        const index2 = indices[i + 1] * 3;
        const index3 = indices[i + 2] * 3;
        const v1 = [vertices[index1], vertices[index1 + 1], vertices[index1 + 2]];
        const v2 = [vertices[index2], vertices[index2 + 1], vertices[index2 + 2]];
        const v3 = [vertices[index3], vertices[index3 + 1], vertices[index3 + 2]];
        const normal = calculateNormal(v1, v2, v3);
        stl += `facet normal ${normal[0]} ${normal[1]} ${normal[2]}\n`;
        stl += 'outer loop\n';
        stl += `vertex ${v1[0]} ${v1[1]} ${v1[2]}\n`;
        stl += `vertex ${v2[0]} ${v2[1]} ${v2[2]}\n`;
        stl += `vertex ${v3[0]} ${v3[1]} ${v3[2]}\n`;
        stl += 'endloop\n';
        stl += 'endfacet\n';
    }
    stl += 'endsolid lithophane\n';
    return stl;
}

function exportToBinarySTL(geometry) {
    const vertices = geometry.getAttribute('position').array;
    const indices = geometry.getIndex().array;
    const numTriangles = indices.length / 3;
    const bufferLength = 84 + (50 * numTriangles);
    const buffer = Buffer.alloc(bufferLength);
    let offset = 0;
    offset += 80;
    buffer.writeUInt32LE(numTriangles, offset);
    offset += 4;
    for (let i = 0; i < indices.length; i += 3) {
        const index1 = indices[i] * 3;
        const index2 = indices[i + 1] * 3;
        const index3 = indices[i + 2] * 3;
        const v1 = [vertices[index1], vertices[index1 + 1], vertices[index1 + 2]];
        const v2 = [vertices[index2], vertices[index2 + 1], vertices[index2 + 2]];
        const v3 = [vertices[index3], vertices[index3 + 1], vertices[index3 + 2]];
        const normal = calculateNormal(v1, v2, v3);
        buffer.writeFloatLE(normal[0], offset);
        buffer.writeFloatLE(normal[1], offset + 4);
        buffer.writeFloatLE(normal[2], offset + 8);
        offset += 12;
        buffer.writeFloatLE(v1[0], offset);
        buffer.writeFloatLE(v1[1], offset + 4);
        buffer.writeFloatLE(v1[2], offset + 8);
        offset += 12;
        buffer.writeFloatLE(v2[0], offset);
        buffer.writeFloatLE(v2[1], offset + 4);
        buffer.writeFloatLE(v2[2], offset + 8);
        offset += 12;
        buffer.writeFloatLE(v3[0], offset);
        buffer.writeFloatLE(v3[1], offset + 4);
        buffer.writeFloatLE(v3[2], offset + 8);
        offset += 12;
        buffer.writeUInt16LE(0, offset);
        offset += 2;
    }
    return buffer;
}

function calculateNormal(v1, v2, v3) {
    const u = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    const v = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
    return [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
    ];
}

module.exports = generateSTL;
