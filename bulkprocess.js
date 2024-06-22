const fs = require('fs');
const path = require('path');
const generateSTL = require('./generateSTL');

async function processBulkImages() {
    const inputDir = path.join(__dirname, 'bulk-process');
    const outputDir = path.join(__dirname, 'bulk-outputs');

    if (!fs.existsSync(inputDir)) {
        console.error('Input directory does not exist:', inputDir);
        return;
    }

    const files = fs.readdirSync(inputDir);
    for (const file of files) {
        const inputFilePath = path.join(inputDir, file);
        const outputFileName = path.parse(file).name; // Remove extension
        const aspectRatio = '4x4'; // Default aspect ratio, adjust as needed

        console.log('Processing', inputFilePath);

        try {
            await generateSTL(inputFilePath, false, outputDir, outputFileName, aspectRatio);
            console.log(`Generated STL for ${inputFilePath} -> ${path.join(outputDir, `${outputFileName}.stl`)}`);
        } catch (error) {
            console.error('Error processing', inputFilePath, ':', error);
        }
    }
}

processBulkImages();
