const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const packageJson = require('../package.json');

const version = packageJson.version;
const outputDir = path.join(__dirname, '../dist');
const outputFilename = `fazzk-extension-v${version}.zip`;
const outputPath = path.join(outputDir, outputFilename);

// Ensure dist directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
});

output.on('close', function () {
    console.log(`Extension zipped successfully: ${outputFilename} (${archive.pointer()} total bytes)`);
});

archive.on('warning', function (err) {
    if (err.code === 'ENOENT') {
        console.warn(err);
    } else {
        throw err;
    }
});

archive.on('error', function (err) {
    throw err;
});

archive.pipe(output);

// Append files from chrome_extension directory
const extensionDir = path.join(__dirname, '../chrome_extension');
archive.directory(extensionDir, false);

archive.finalize();
